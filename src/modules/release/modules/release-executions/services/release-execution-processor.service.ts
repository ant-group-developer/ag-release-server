import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { EntityManager, In } from 'typeorm';
import { ReleaseExecutionDsp } from '../entities/release-execution-dsp.entity';
import { ReleaseExecutionStep } from '../entities/release-execution-step.entity';
import { ReleaseExecution } from '../entities/release-execution.entity';
import { ExecutionStatus, StepStatus, StepType } from '../enum/release-execution.enum';

@Injectable()
export class ReleaseExecutionProcessorService {
    private readonly logger = new Logger(ReleaseExecutionProcessorService.name);

    constructor(
        @InjectEntityManager()
        private readonly manager: EntityManager,
    ) {}

    /**
     * Hàm được Job Queue (VD: BullMQ) gọi khi có Job mới truyền vào executionId.
     * Thằng này sẽ Tự Phân Loại -> Tự Gọi Hàm Xử Lý -> Và Tự Bắn Log Lên Bảng Step.
     */
    async processQueueItem(executionId: string) {
        // 1. Kéo mảng Dsp Code mà user chọn lúc Submit ra từ lịch sử cha
        const execution = await this.manager.findOne(ReleaseExecution, { where: { id: executionId } });
        if (!execution || execution.status !== ExecutionStatus.QUEUED || !execution.originalDspCodes) return;

        // Báo hiệu đang chạy
        await this.manager.update(ReleaseExecution, executionId, { 
            status: ExecutionStatus.RUNNING, 
            startedAt: new Date() 
        });

        const dsps = await this.manager.find(Dsp, {
            where: { code: In(execution.originalDspCodes) },
            relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
        });

        // ==========================================
        // BƯỚC 1: TẠO SẴN TOÀN BỘ CÁC TRẠNG THÁI CON (DSP) TRÊN DATABASE VỚI STATUS QUEUED
        // TUYỆT ĐỐI KHÔNG SUY NGHĨ LOGIC VÀO BƯỚC NÀY.
        // ==========================================
        const execDsps: { execDsp: ReleaseExecutionDsp, dspOrig: Dsp }[] = [];
        for (const dsp of dsps) {
            const doc = await this.saveDspTracking({
                executionId, 
                dsp, 
                status: ExecutionStatus.QUEUED
            });
            execDsps.push({ execDsp: doc, dspOrig: dsp });
        }

        // ==========================================
        // BƯỚC 2: CHIA NHÓM ĐỂ THỰC THI (DIRECT VS AGGREGATOR)
        // DỰA TRÊN CÁC BẢN GHI ĐÃ TẠO Ở BƯỚC 1
        // ==========================================
        const directItems: { execDsp: ReleaseExecutionDsp, dspOrig: Dsp }[] = []; 
        const aggMap = new Map<string, { execDsp: ReleaseExecutionDsp, dspOrig: Dsp }[]>();

        for (const item of execDsps) {
            const config = item.dspOrig.dspRoutingConfig;
            if (!config || config.mode === RoutingModeEnum.DIRECT) {
                directItems.push(item);
            } else if (config.mode === RoutingModeEnum.AGGREGATOR && config.aggregator) {
                const aggCode = config.aggregator.code;
                if (!aggMap.has(aggCode)) aggMap.set(aggCode, []);
                aggMap.get(aggCode)!.push(item);
            }
        }

        // ==========================================
        // BƯỚC 3: DỰNG TRƯỚC TOÀN BỘ CHECKLIST (STEPS) VÀO DB VỚI TRẠNG THÁI PENDING
        // ĐỂ UI RENDER ĐƯỢC FULL CÁC BƯỚC DỰ KIẾN TRƯỚC KHI THỰC SỰ CHẠY
        // ==========================================
        let sortOrder = 1;

        // 3.1 Dựng Step cho nhóm Direct
        const directTasks: any[] = [];
        for (const item of directItems) {
            const stepMeta = await this.saveStepTracking({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.CREATE_METADATA, sortOrder: sortOrder++ });
            const stepUpload = await this.saveStepTracking({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.UPLOAD_SFTP, sortOrder: sortOrder++ });
            directTasks.push({ item, stepMeta, stepUpload });
        }

        // 3.2 Dựng Step cho nhóm Aggregator
        const aggTasks = new Map<string, any>();
        for (const [aggCode, groupedItems] of aggMap.entries()) {
            const aggregatorId = groupedItems[0].dspOrig.dspRoutingConfig.aggregator!.id;
            
            const groupMetaSteps: ReleaseExecutionStep[] = [];
            for (const item of groupedItems) {
                groupMetaSteps.push(await this.saveStepTracking({ execDspId: item.execDsp.id, aggregatorId, stepType: StepType.CREATE_METADATA, sortOrder }));
            }
            sortOrder++;

            const groupUploadSteps: ReleaseExecutionStep[] = [];
            for (const item of groupedItems) {
                groupUploadSteps.push(await this.saveStepTracking({ execDspId: item.execDsp.id, aggregatorId, stepType: StepType.UPLOAD_SFTP, sortOrder }));
            }
            sortOrder++;

            const postHooks: any[] = [];
            for (const item of groupedItems) {
                const dsp = item.dspOrig;
                let stepExcel = null, stepMail = null, stepWait = null;

                if (aggCode === 'CI') {
                    if (!dsp.hasDeal) { 
                        stepExcel = await this.saveStepTracking({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.EXPORT_EXCEL, sortOrder: sortOrder++ });
                        stepMail = await this.saveStepTracking({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.SEND_EMAIL, sortOrder: sortOrder++ });
                    } else {
                        stepWait = await this.saveStepTracking({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.WAITING_EXPORT, sortOrder: sortOrder++ });
                    }
                }
                postHooks.push({ item, stepExcel, stepMail, stepWait });
            }

            aggTasks.set(aggCode, { aggregatorId, groupMetaSteps, groupUploadSteps, postHooks });
        }

        // ==========================================
        // BƯỚC 4: BẮT ĐẦU VẶN GA THỰC THI (UPDATE RUNNING -> GỌI LOGIC -> UPDATE SUCCESS)
        // ==========================================

        // A. XỬ LÝ TRỰC TIẾP TỪNG THẰNG LẺ (DIRECT)
        for (const task of directTasks) {
            const dsp = task.item.dspOrig;
            const execDsp = task.item.execDsp;

            // Đánh dấu DSP này chính thức bắt đầu cày
            await this.updateDspStatus({ dspId: execDsp.id, status: ExecutionStatus.RUNNING });
            
            await this.runStepLogic({
                step: task.stepMeta, 
                task: async () => {
                    // TODO: Gọi hàm Create XML xịn
                    this.logger.log(`Creating Direct Metadata cho DSP ${dsp.code}`);
                }
            });

            await this.runStepLogic({
                step: task.stepUpload, 
                task: async () => {
                    // TODO: Gọi hàm Upload SFTP xịn
                    this.logger.log(`Uploading Direct SFTP cho DSP ${dsp.code}`);
                }
            });

            // Xong việc của DSP lẻ
            await this.updateDspStatus({ dspId: execDsp.id, status: ExecutionStatus.COMPLETED });
        }

        // B. XỬ LÝ NHÓM AGGREGATOR (CHẠY CHUNG)
        for (const [aggCode, taskGroup] of aggTasks.entries()) {
            const { aggregatorId, groupMetaSteps, groupUploadSteps, postHooks } = taskGroup;

            const pureExecDsps = postHooks.map((h: any) => h.item.execDsp);

            // Đánh dấu cả bầy bắt đầu cày
            await Promise.all(pureExecDsps.map((e: any) => this.updateDspStatus({ dspId: e.id, status: ExecutionStatus.RUNNING })));

            await this.runGroupStepLogic({
                steps: groupMetaSteps, 
                task: async () => {
                    // TODO: Hàm sinh XML CI cho cả đám
                    this.logger.log(`Đang gom nhóm tạo Metadata cho ${aggCode} gồm ${pureExecDsps.length} DSP...`);
                }
            });

            await this.runGroupStepLogic({
                steps: groupUploadSteps, 
                task: async () => {
                    // TODO: Hàm Upload thư mục CI
                    this.logger.log(`Đang up SFTP thư mục nhóm ${aggCode}...`);
                }
            });

            for (const hook of postHooks) {
                const dsp = hook.item.dspOrig;
                const execDsp = hook.item.execDsp;

                if (hook.stepExcel) {
                    await this.runStepLogic({
                        step: hook.stepExcel, 
                        task: async () => {
                            this.logger.log(`Auto Export Excel cho ${dsp.code}`);
                        }
                    });
                }
                
                if (hook.stepMail) {
                    await this.runStepLogic({
                        step: hook.stepMail, 
                        task: async () => {
                            this.logger.log(`Auto Send Mail cho ${dsp.code}`);
                        }
                    });
                }

                if (hook.stepWait) {
                    await this.runStepLogic({
                        step: hook.stepWait, 
                        task: async () => {}, 
                        keepPending: true 
                    }); // Giữ nguyên trạng thái PENDING để UI hiện màu vàng
                }
            }

            // Xong việc cả bầy
            await Promise.all(pureExecDsps.map((e: any) => this.updateDspStatus({ dspId: e.id, status: ExecutionStatus.COMPLETED })));
        }

        // 5. Kết thúc thắng lợi toàn cục
        await this.manager.update(ReleaseExecution, executionId, { 
            status: ExecutionStatus.COMPLETED,  // Nếu có lỗi thì nó đã văng Catch từ trước r
            completedAt: new Date() 
        });
    }

    // --- CÁC HÀM TIỆN ÍCH DƯỚI ĐÂY LÀ ĐỂ VỪA CHẠY VỪA NHÉT LOG VÀO DB --- //

    private async saveDspTracking(params: { executionId: string, dsp: Dsp, status: ExecutionStatus }) {
        const doc = this.manager.create(ReleaseExecutionDsp, {
            executionId: params.executionId,
            dspId: params.dsp.id,
            status: params.status, 
        });
        return this.manager.save(ReleaseExecutionDsp, doc);
    }

    private async updateDspStatus(params: { dspId: string, status: ExecutionStatus }) {
        await this.manager.update(ReleaseExecutionDsp, params.dspId, { status: params.status });
    }

    private async saveStepTracking(params: { execDspId: string, aggregatorId: string | null, stepType: StepType, sortOrder: number }) {
        const step = this.manager.create(ReleaseExecutionStep, {
            executionDspId: params.execDspId, 
            aggregatorId: params.aggregatorId, 
            stepType: params.stepType, 
            sortOrder: params.sortOrder,
            status: StepStatus.PENDING 
        });
        return this.manager.save(ReleaseExecutionStep, step);
    }

    /** Cập nhật DB và Chạy Code Logic cho 1 Step */
    private async runStepLogic(params: {
        step: ReleaseExecutionStep, 
        task: () => Promise<void>,
        keepPending?: boolean
    }) {
        const { step, task, keepPending } = params;
        step.status = StepStatus.RUNNING;
        step.startedAt = new Date();
        await this.manager.save(ReleaseExecutionStep, step);

        try {
            await task();
            if(!keepPending) {
                step.status = StepStatus.SUCCESS;
                step.completedAt = new Date();
                await this.manager.save(ReleaseExecutionStep, step);
            }
        } catch (error) {
            step.status = StepStatus.FAILED;
            step.logs = String(error);
            step.completedAt = new Date();
            await this.manager.save(ReleaseExecutionStep, step);
            throw error; 
        }
    }

    /** Cập nhật DB và Chạy Code Logic cho 1 Nhóm Step (CI) */
    private async runGroupStepLogic(params: {
        steps: ReleaseExecutionStep[], 
        task: () => Promise<void>
    }) {
        const { steps, task } = params;
        await Promise.all(steps.map(step => {
            step.status = StepStatus.RUNNING;
            step.startedAt = new Date();
            return this.manager.save(ReleaseExecutionStep, step);
        }));

        try {
            await task(); 
            await Promise.all(steps.map(step => {
                step.status = StepStatus.SUCCESS;
                step.completedAt = new Date();
                return this.manager.save(ReleaseExecutionStep, step);
            }));
        } catch (error) {
            await Promise.all(steps.map(step => {
                step.status = StepStatus.FAILED;
                step.logs = String(error);
                step.completedAt = new Date();
                return this.manager.save(ReleaseExecutionStep, step);
            }));
            throw error;
        }
    }
}
