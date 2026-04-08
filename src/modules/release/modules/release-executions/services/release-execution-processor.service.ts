import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ErnVersion } from 'src/modules/ern/interfaces/ern-input.interface';
import { ReleaseDdexService } from 'src/modules/release/services/release-ddex.service';
import { EntityManager, In } from 'typeorm';
import { ReleaseExecutionDsp } from '../entities/release-execution-dsp.entity';
import { ReleaseExecutionStep } from '../entities/release-execution-step.entity';
import { ReleaseExecution } from '../entities/release-execution.entity';
import { ExecutionStatus, StepStatus, StepType } from '../enum/release-execution.enum';
import * as path from 'path';
import { removeFolder } from 'src/utils/util';

@Injectable()
export class ReleaseExecutionProcessorService {
    private readonly logger = new Logger(ReleaseExecutionProcessorService.name);

    constructor(
        @InjectEntityManager()
        private readonly manager: EntityManager,
        private readonly releaseDdexService: ReleaseDdexService,
        private readonly dspRoutingService: DspRoutingConfigsService,
        private readonly sftpConnectService: SftpConnectService,
    ) {}

    /**
     * Hàm được Job Queue (VD: BullMQ) gọi khi có Job mới truyền vào executionId.
     * Thằng này sẽ Tự Phân Loại -> Tự Gọi Hàm Xử Lý -> Và Tự Bắn Log Lên Bảng Step.
     */
    async processQueueItem(executionId: string) {
        // ==========================================
        // TÁCH HÀM 1: CHUẨN BỊ KẾ HOẠCH BẰNG CÁCH DỰNG CHECKLIST VÀO DB
        // ==========================================
        await this.prepareExecutionPlan(executionId);

        // ==========================================
        // TÁCH HÀM 2: VẶN GA THỰC THI TỪ KẾ HOẠCH BÊN TRONG DB
        // ==========================================

        // return
        await this.runExecutionPlan(executionId);
    }

    /**
     * Hàm 1: Chuẩn bị Execution Plan (Dựng tất cả trạng thái và checklist vào DB)
     */
    async prepareExecutionPlan(executionId: string) {
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
        // ==========================================
        const execDspsDocs = dsps.map(dsp => this.manager.create(ReleaseExecutionDsp, {
            executionId,
            dspId: dsp.id,
            status: ExecutionStatus.QUEUED
        }));
        const insertedDsps = await this.manager.save(ReleaseExecutionDsp, execDspsDocs);
        const execDsps = insertedDsps.map((doc, index) => ({ execDsp: doc, dspOrig: dsps[index] }));

        // ==========================================
        // BƯỚC 2: DỰNG TRƯỚC TOÀN BỘ CHECKLIST (STEPS) VÀO DB VỚI TRẠNG THÁI PENDING
        // Tính độc lập: Mỗi DSP tự build full luồng của riêng mình
        // ==========================================
        let order = 1;
        const stepsToInsert: ReleaseExecutionStep[] = [];

        const pushStep = (params: { execDspId: string, aggregatorId: string | null, stepType: StepType, order: number, status?: StepStatus }) => {
            stepsToInsert.push(this.manager.create(ReleaseExecutionStep, {
                executionDspId: params.execDspId,
                aggregatorId: params.aggregatorId,
                stepType: params.stepType,
                order: params.order,
                status: params.status || StepStatus.PENDING
            }));
        };

        for (const item of execDsps) {
            const config = item.dspOrig.dspRoutingConfig;
            const aggregatorId = config?.mode === RoutingModeEnum.AGGREGATOR && config.aggregator ? config.aggregator.id : null;
            const aggCode = config?.aggregator?.code;

            // Mọi DSP đều cần sinh metadata và upload
            pushStep({ execDspId: item.execDsp.id, aggregatorId, stepType: StepType.CREATE_METADATA, order: order++ });
            pushStep({ execDspId: item.execDsp.id, aggregatorId, stepType: StepType.UPLOAD_SFTP, order: order++ });

            // Nếu phân phối qua CI -> Tùy theo hasDeal mà nảy sinh các step thủ công
            if (config?.mode === RoutingModeEnum.AGGREGATOR && aggCode === 'CI') {
                pushStep({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.POST_UPLOAD_HOOK, order: order++ });

                if (!item.dspOrig.hasDeal) {
                    pushStep({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.EXPORT_EXCEL, order: order++ });
                    pushStep({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.SEND_EMAIL, order: order++ });
                } else {
                    pushStep({ execDspId: item.execDsp.id, aggregatorId: null, stepType: StepType.WAITING_EXPORT, order: order++ });
                }
            }
        }

        if (stepsToInsert.length > 0) {
            await this.manager.save(ReleaseExecutionStep, stepsToInsert);
        }
    }

    /**
     * Hàm 2: Thực thi logic - Duyệt flat mảng step theo order
     * Khi step đầu tiên của 1 DSP bắt đầu → DSP đó chuyển RUNNING
     * Khi step cuối cùng của 1 DSP xong → DSP đó chuyển COMPLETED
     */
    async runExecutionPlan(executionId: string) {
        // Kéo flat toàn bộ steps của execution này, sort theo đúng thứ tự đã lên kế hoạch
        const allSteps = await this.manager.find(ReleaseExecutionStep, {
            where: { executionDsp: { executionId } },
            relations: ['executionDsp', 'executionDsp.dsp'],
            order: { order: 'ASC' },
        });

        // Đếm tổng số step của từng DSP để biết khi nào nó xong
        const dspTotalSteps = new Map<string, number>();
        const dspCompletedSteps = new Map<string, number>();
        const dspStarted = new Set<string>();
        const dspFailed = new Set<string>(); // Theo dõi DSP bị lỗi

        for (const step of allSteps) {
            const dspId = step.executionDspId;
            dspTotalSteps.set(dspId, (dspTotalSteps.get(dspId) || 0) + 1);
            dspCompletedSteps.set(dspId, 0);
        }

        // Duyệt tuần tự từng step theo order
        for (const step of allSteps) {
            const dspId = step.executionDspId;

            // Bỏ qua nếu DSP này đã bị lỗi ở một step trước đó
            if (dspFailed.has(dspId)) {
                continue;
            }

            const keepPending = step.stepType === StepType.WAITING_EXPORT;

            // Nếu DSP này chưa RUNNING → đẩy lên RUNNING
            if (!dspStarted.has(dspId)) {
                dspStarted.add(dspId);
                await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.RUNNING });
            }

            try {
                // Chạy step
                await this.runStepLogic({
                    step,
                    keepPending,
                    task: () => this.dispatchStepTask(step),
                });
            } catch (error) {
                // Gặp lỗi → Đánh dấu DSP này FAILED và lập tức nhảy qua vòng lặp tiếp theo
                dspFailed.add(dspId);
                await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.FAILED });
                continue;
            }

            // Đếm step đã xong của DSP này
            if (!keepPending) {
                dspCompletedSteps.set(dspId, dspCompletedSteps.get(dspId)! + 1);
            }

            // Nếu DSP này đã duyệt hết tất cả steps → cập nhật trạng thái cha
            if (dspCompletedSteps.get(dspId)! + (keepPending ? 1 : 0) === dspTotalSteps.get(dspId)) {
                if (keepPending) {
                    // Còn step WAITING → DSP chờ hành động thủ công
                    await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.AWAITING_ACTION });
                } else {
                    // Tất cả step đã xong → DSP hoàn thành
                    await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.COMPLETED });
                }
            }
        }

        // Kiểm tra trạng thái cuối để chốt Execution cha
        const totalDSPs = dspTotalSteps.size;
        const failedCount = dspFailed.size;

        const awaitingCount = await this.manager.count(ReleaseExecutionDsp, {
            where: { executionId, status: ExecutionStatus.AWAITING_ACTION }
        });

        let finalStatus = ExecutionStatus.COMPLETED;
        if (failedCount === totalDSPs && totalDSPs > 0) {
            finalStatus = ExecutionStatus.FAILED;
        } else if (failedCount > 0) {
            finalStatus = ExecutionStatus.PARTIALLY_COMPLETED;
        }
        
        if (awaitingCount > 0) {
            finalStatus = ExecutionStatus.AWAITING_ACTION;
        }

        // Kết thúc toàn cục
        await this.manager.update(ReleaseExecution, executionId, { 
            status: finalStatus,
            completedAt: finalStatus !== ExecutionStatus.AWAITING_ACTION ? new Date() : undefined 
        });
    }

    /** 
     * Điều hướng step sang đúng hàm xử lý nghiệp vụ theo stepType 
     * Mỗi step cần load context: releaseId (từ execution cha) + dspCode (từ DSP cha)
     */
    private async dispatchStepTask(step: ReleaseExecutionStep) {
        // Load context cần thiết
        const execDsp = await this.manager.findOne(ReleaseExecutionDsp, {
            where: { id: step.executionDspId },
            relations: ['execution', 'dsp'],
        });
        if (!execDsp) throw new Error(`Không tìm thấy ExecutionDsp ${step.executionDspId}`);

        const releaseId = execDsp.execution.releaseId;
        const dspCode = execDsp.dsp.code;

        switch (step.stepType) {
            case StepType.CREATE_METADATA: {
                // Resolve config của DSP này từ DB
                const config = await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

                // Tạo metadata (XML + audio + image) trên server
                const { outputDir, batchId } = await this.releaseDdexService.createMetadataOnServer({
                    releaseId,
                    ernVersion: config.ernVersion as ErnVersion,
                    sender: config.sender,
                    recipient: config.recipient,
                });

                // Lưu lại context vào step metadata (KHÔNG lưu thông tin nhạy cảm như SFTP credentials)
                await this.manager.update(ReleaseExecutionStep, step.id, {
                    metadata: {
                        releaseId,
                        dspCode,
                        outputDir,
                        batchId,
                        createsDoneFolder: config.createsDoneFolder ?? false,
                    } as Record<string, any>,
                });

                this.logger.log(`[CREATE_METADATA] DSP: ${dspCode} | outputDir: ${outputDir}`);
                break;
            }

            case StepType.UPLOAD_SFTP: {
                // Lấy metadata từ step CREATE_METADATA cùng DSP
                const metaStep = await this.manager.findOne(ReleaseExecutionStep, {
                    where: { executionDspId: step.executionDspId, stepType: StepType.CREATE_METADATA },
                });
                const meta = metaStep?.metadata;
                if (!meta?.outputDir || !meta?.dspCode) {
                    throw new Error(`Thiếu metadata từ step CREATE_METADATA của DSP ${dspCode}`);
                }

                // Resolve SFTP config tươi từ DB (không lưu credentials vào metadata)
                const config = await this.dspRoutingService.resolveFullDeliveryConfig(meta.dspCode);

                // Upload lên SFTP (retry đã được xử lý bởi runStepLogic)
                await this.sftpConnectService.uploadFolder({
                    sftp: config.sftp,
                    localDir: meta.outputDir,
                    remoteDir: config.sftp.path ?? '/',
                });

                this.logger.log(`[UPLOAD_SFTP] DSP: ${dspCode} | Upload thành công`);
                break;
            }

            case StepType.POST_UPLOAD_HOOK: {
                // Lấy metadata từ step CREATE_METADATA cùng DSP
                const metaStep = await this.manager.findOne(ReleaseExecutionStep, {
                    where: { executionDspId: step.executionDspId, stepType: StepType.CREATE_METADATA },
                });
                const meta = metaStep?.metadata;

                // Tạo thư mục .done trên SFTP (dành cho CI aggregator)
                if (meta?.createsDoneFolder && meta?.batchId && meta?.dspCode) {
                    const config = await this.dspRoutingService.resolveFullDeliveryConfig(meta.dspCode);
                    const client = await this.sftpConnectService.connect(config.sftp);
                    try {
                        const donePath = path.posix.join(config.sftp.path ?? '/', `${meta.batchId}.done`);
                        await client.mkdir(donePath, true);
                        this.logger.log(`[POST_UPLOAD_HOOK] Created .done folder: ${donePath}`);
                    } finally {
                        await client.end();
                    }
                }

                // Cleanup local files
                if (meta?.outputDir) await removeFolder(meta.outputDir);

                break;
            }

            case StepType.EXPORT_EXCEL:
                // TODO: Implement CI Excel export
                this.logger.log(`[EXPORT_EXCEL] DSP: ${dspCode} - Chưa implement`);
                break;

            case StepType.SEND_EMAIL:
                // TODO: Implement email sending
                this.logger.log(`[SEND_EMAIL] DSP: ${dspCode} - Chưa implement`);
                break;

            case StepType.WAITING_EXPORT:
                break; // Không làm gì, chờ manual action
        }
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

    private async saveStepTracking(params: { execDspId: string, aggregatorId: string | null, stepType: StepType, order: number, status?: StepStatus }) {
        const step = this.manager.create(ReleaseExecutionStep, {
            executionDspId: params.execDspId, 
            aggregatorId: params.aggregatorId, 
            stepType: params.stepType, 
            order: params.order,
            status: params.status || StepStatus.PENDING 
        });
        return this.manager.save(ReleaseExecutionStep, step);
    }

    private async runStepLogic(params: {
        step: ReleaseExecutionStep, 
        task: () => Promise<void>,
        keepPending?: boolean,
        maxRetries?: number,
    }) {
        const { step, task, keepPending, maxRetries = 3 } = params;
        if (step.status === StepStatus.SKIPPED) return;

        await this.manager.update(ReleaseExecutionStep, step.id, {
            status: StepStatus.RUNNING,
            startedAt: new Date(),
        });

        let lastError: any = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await task();

                // Thành công
                if (!keepPending) {
                    await this.manager.update(ReleaseExecutionStep, step.id, {
                        status: StepStatus.SUCCESS,
                        completedAt: new Date(),
                        retryCount: attempt - 1,
                    });
                } else {
                    await this.manager.update(ReleaseExecutionStep, step.id, {
                        status: StepStatus.WAITING_ACTION,
                        retryCount: attempt - 1,
                    });
                }
                return; // Thoát khỏi hàm luôn
            } catch (error: any) {
                lastError = error;
                await this.manager.update(ReleaseExecutionStep, step.id, {
                    retryCount: attempt,
                });

                this.logger.warn(`[STEP_RETRY] Step ${step.stepType} lần ${attempt}/${maxRetries}: ${error.message}`);

                if (attempt < maxRetries) {
                    // Đợi trước khi retry (3s, 6s, 9s...)
                    await new Promise(r => setTimeout(r, 3000 * attempt));
                }
            }
        }

        // Hết số lần retry → FAILED
        await this.manager.update(ReleaseExecutionStep, step.id, {
            status: StepStatus.FAILED,
            logs: String(lastError),
            completedAt: new Date(),
        });
        throw lastError; 
    }

    /** Cập nhật DB và Chạy Code Logic cho 1 Nhóm Step (CI) */
    private async runGroupStepLogic(params: {
        steps: ReleaseExecutionStep[], 
        task: () => Promise<void>
    }) {
        const { steps, task } = params;
        await Promise.all(steps.map(step => {
            return this.manager.update(ReleaseExecutionStep, step.id, {
                status: StepStatus.RUNNING,
                startedAt: new Date(),
            });
        }));

        try {
            await task(); 
            await Promise.all(steps.map(step => {
                return this.manager.update(ReleaseExecutionStep, step.id, {
                    status: StepStatus.SUCCESS,
                    completedAt: new Date(),
                });
            }));
        } catch (error) {
            await Promise.all(steps.map(step => {
                return this.manager.update(ReleaseExecutionStep, step.id, {
                    status: StepStatus.FAILED,
                    logs: String(error),
                    completedAt: new Date(),
                });
            }));
            throw error;
        }
    }
}
