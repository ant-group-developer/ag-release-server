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



        // ExecDsp cho các step tổng (general steps) với dspId = null
        const generalExecDspDoc = this.manager.create(ReleaseExecutionDsp, {
            executionId,
            dspId: null as any,
            status: ExecutionStatus.QUEUED
        });

        // ==========================================
        // TẠO SẴN TOÀN BỘ CÁC TRẠNG THÁI CON (DSP) TRÊN DATABASE VỚI STATUS QUEUED
        // ==========================================
        const execDspsDocs = dsps.map(dsp => this.manager.create(ReleaseExecutionDsp, {
            executionId,
            dspId: dsp.id,
            status: ExecutionStatus.QUEUED
        }));
        
        const insertedDsps = await this.manager.save(ReleaseExecutionDsp, [...execDspsDocs, generalExecDspDoc]);
        
        const generalExecDsp = insertedDsps.find(d => !d.dspId)!;
        const execDsps = insertedDsps.filter(d => Boolean(d.dspId)).map(doc => ({
            execDsp: doc,
            dspOrig: dsps.find(d => d.id === doc.dspId)!
        }));

        // ==========================================
        // BƯỚC 2: DỰNG TRƯỚC TOÀN BỘ CHECKLIST (STEPS) VÀO DB VỚI TRẠNG THÁI PENDING
        // ==========================================
        const stepsToInsert: ReleaseExecutionStep[] = [];
        let generalOrder = 1;

        const pushGeneralStep = (stepType: StepType, aggregatorId: string | null = null) => {
            stepsToInsert.push(this.manager.create(ReleaseExecutionStep, {
                executionDspId: generalExecDsp.id,
                aggregatorId,
                stepType,
                order: generalOrder++,
                status: StepStatus.PENDING
            }));
        };

        let hasErn43 = false;
        let hasErn383 = false;
        let hasCi = false;
        let hasSftp = false;
        let hasSftpCi = false;

        for (const item of execDsps) {
            try {
                const fullConfig = await this.dspRoutingService.resolveFullDeliveryConfig(item.dspOrig.code);
                
                if (fullConfig.ernVersion === ErnVersion.ERN_43) hasErn43 = true;
                if (String(fullConfig.ernVersion) === '3.8.3' || fullConfig.ernVersion === ErnVersion.ERN_382) hasErn383 = true;

                if (fullConfig.isCI) {
                    hasCi = true;
                    hasSftpCi = true;
                } else if (fullConfig.sftp) {
                    // Nếu là sftp thường
                    hasSftp = true;
                }
            } catch (e) {
                this.logger.warn(`Could not resolve full config for DSP ${item.dspOrig.code}`);
            }
        }

        // Đẩy các step tổng
        pushGeneralStep(StepType.GENERATE_UPC);
        pushGeneralStep(StepType.GENERATE_ISRC);

        if (hasErn43) pushGeneralStep(StepType.CREATE_METADATA_ERN_4_3);
        if (hasErn383) pushGeneralStep(StepType.CREATE_METADATA_ERN_3_8_3);
        if (hasCi) pushGeneralStep(StepType.CREATE_METADATA_CI);
        
        if (hasSftp) pushGeneralStep(StepType.UPLOAD_SFTP);
        if (hasSftpCi) pushGeneralStep(StepType.UPLOAD_SFTP_CI);
        if (hasCi) pushGeneralStep(StepType.CREATE_DONE_FOLDER);

        // Đẩy các step riêng biệt cho từng DSP
        for (const item of execDsps) {
            const config = item.dspOrig.dspRoutingConfig;
            const aggregatorId = config?.mode === RoutingModeEnum.AGGREGATOR && config.aggregator ? config.aggregator.id : null;
            const aggCode = config?.aggregator?.code;

            let dspOrder = 1;
            const pushDspStep = (stepType: StepType) => {
                stepsToInsert.push(this.manager.create(ReleaseExecutionStep, {
                    executionDspId: item.execDsp.id,
                    aggregatorId,
                    stepType,
                    order: dspOrder++,
                    status: StepStatus.PENDING
                }));
            };

            // Nếu phân phối qua CI -> Tùy theo hasDeal mà nảy sinh các step thủ công
            if (config?.mode === RoutingModeEnum.AGGREGATOR && aggCode === 'CI') {
                if (!item.dspOrig.hasDeal) {
                    pushDspStep(StepType.EXPORT_EXCEL);
                    pushDspStep(StepType.SEND_EMAIL_EXPORT);
                } else {
                    pushDspStep(StepType.WAITING_EXPORT);
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
        // Kéo toàn bộ DSPs thuộc execution này cùng với list steps của nó
        const execDsps = await this.manager.find(ReleaseExecutionDsp, {
            where: { executionId },
            relations: ['steps'],
        });

        // Đảm bảo step tổng (dspId === null) chạy đầu tiên
        execDsps.sort((a, b) => {
            if (a.dspId === null) return -1;
            if (b.dspId === null) return 1;
            return 0;
        });

        let failedCount = 0;
        let awaitingCount = 0;

        for (const execDsp of execDsps) {
            // Đảm bảo step chạy đúng order
            const steps = execDsp.steps.sort((a, b) => a.order - b.order);
            const status = await this.processDspExecution(execDsp.id, steps);

            if (status === ExecutionStatus.FAILED) {
                failedCount++;
            } else if (status === ExecutionStatus.AWAITING_ACTION) {
                awaitingCount++;
            }
        }

        let finalStatus = ExecutionStatus.COMPLETED;

        if (failedCount > 0) {
            finalStatus = ExecutionStatus.FAILED;
        } else if (awaitingCount > 0) {
            finalStatus = ExecutionStatus.AWAITING_ACTION;
        }

        // Kết thúc toàn cục
        await this.manager.update(ReleaseExecution, executionId, { 
            status: finalStatus,
            completedAt: finalStatus !== ExecutionStatus.AWAITING_ACTION ? new Date() : undefined 
        });
    }

    /** 
     * Xử lý trọn gói toàn bộ bước của 1 DSP 
     */
    private async processDspExecution(dspId: string, steps: ReleaseExecutionStep[]): Promise<ExecutionStatus> {
        // Bật DSP sang RUNNING
        await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.RUNNING });

        let keepPendingCount = 0;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const keepPending = step.stepType === StepType.WAITING_EXPORT;

            try {
                // Chạy step
                await this.runStepLogic({
                    step,
                    keepPending,
                    task: () => this.dispatchStepTask(step),
                });

                if (keepPending) {
                    keepPendingCount++;
                }
            } catch (error) {
                // Nếu 1 step bị lỗi -> DSP cha báo lỗi
                await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.FAILED });
                
                // SKIPPED toàn bộ các step còn sót lại chưa chạy của DSP này
                const remainingStepsIds = steps.slice(i + 1).map(s => s.id);
                if (remainingStepsIds.length > 0) {
                    await this.manager.createQueryBuilder()
                        .update(ReleaseExecutionStep)
                        .set({ status: StepStatus.SKIPPED })
                        .whereInIds(remainingStepsIds)
                        .execute();
                }

                return ExecutionStatus.FAILED;
            }
        }

        // Kiểm tra sau khi chạy xong step để báo COMPLETED hay AWAITING_ACTION
        if (keepPendingCount > 0) {
            await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.AWAITING_ACTION });
            return ExecutionStatus.AWAITING_ACTION;
        } else {
            await this.manager.update(ReleaseExecutionDsp, dspId, { status: ExecutionStatus.COMPLETED });
            return ExecutionStatus.COMPLETED;
        }
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
        const dspCode = execDsp.dsp?.code;

        switch (step.stepType) {
            case StepType.GENERATE_UPC:
            case StepType.GENERATE_ISRC: {
                this.logger.log(`[${step.stepType}] Release: ${releaseId}`);
                // TODO: Triển khai logic gen UPC/ISRC
                break;
            }

            case StepType.CREATE_METADATA_ERN_4_3:
            case StepType.CREATE_METADATA_ERN_3_8_3:
            case StepType.CREATE_METADATA_CI: {
                this.logger.log(`[${step.stepType}] Release: ${releaseId}`);
                // TODO: Triển khai logic tạo metadata chung
                break;
            }

            case StepType.UPLOAD_SFTP:
            case StepType.UPLOAD_SFTP_CI: {
                this.logger.log(`[${step.stepType}] Release: ${releaseId}`);
                // TODO: Triển khai logic upload sftp
                break;
            }

            case StepType.CREATE_DONE_FOLDER: {
                this.logger.log(`[CREATE_DONE_FOLDER] Release: ${releaseId}`);
                // TODO: Triển khai logic tạo thư mục .done
                break;
            }

            case StepType.EXPORT_EXCEL:
                // TODO: Implement CI Excel export
                this.logger.log(`[EXPORT_EXCEL] DSP: ${dspCode} - Chưa implement`);
                break;

            case StepType.SEND_EMAIL_EXPORT:
                // TODO: Implement email sending
                this.logger.log(`[SEND_EMAIL_EXPORT] DSP: ${dspCode} - Chưa implement`);
                break;

            case StepType.WAITING_EXPORT:
                break; // Không làm gì, chờ manual action
        }
    }

    // --- CÁC HÀM TIỆN ÍCH DƯỚI ĐÂY LÀ ĐỂ VỪA CHẠY VỪA NHÉT LOG VÀO DB --- //

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

}
