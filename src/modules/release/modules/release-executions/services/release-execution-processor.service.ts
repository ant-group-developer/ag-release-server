import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { NotificationResendService } from 'src/modules/notification/services/notification.resend-service';
import { NotificationService } from 'src/modules/notification/services/notification.service';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { ReleaseDdexService } from 'src/modules/release/services/release-ddex.service';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { removeFolder } from 'src/utils/util';
import { EntityManager, In } from 'typeorm';
import { ReleaseExecutionDsp } from '../entities/release-execution-dsp.entity';
import { ReleaseExecutionStep } from '../entities/release-execution-step.entity';
import { ReleaseExecution } from '../entities/release-execution.entity';
import {
	ExecutionStatus,
	StepStatus,
	StepType,
} from '../enum/release-execution.enum';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';

@Injectable()
export class ReleaseExecutionProcessorService {
	private readonly logger = new Logger(ReleaseExecutionProcessorService.name);

	constructor(
		@InjectEntityManager()
		private readonly manager: EntityManager,
		private readonly releaseDdexService: ReleaseDdexService,

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,

		private readonly dspRoutingService: DspRoutingConfigsService,
		private readonly sftpConnectService: SftpConnectService,
		private readonly notificationService: NotificationService,
		private readonly notificationResendService: NotificationResendService,
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
		const execution = await this.manager.findOne(ReleaseExecution, {
			where: { id: executionId },
		});
		if (
			!execution ||
			execution.status !== ExecutionStatus.QUEUED ||
			!execution.originalDspCodes
		)
			return;

		// Bật Execution sang RUNNING
		await this.manager.update(ReleaseExecution, executionId, {
			status: ExecutionStatus.RUNNING,
			startedAt: new Date(),
		});

		// SYNC: Cập nhật Release sang PROCESSING
		const initialExec = await this.manager.findOne(ReleaseExecution, {
			where: { id: executionId },
		});
		if (initialExec?.releaseId) {
			await this.manager.update(Release, initialExec.releaseId, {
				status: ReleaseStatus.PROCESSING,
			});
		}

		const dsps = await this.manager.find(Dsp, {
			where: { code: In(execution.originalDspCodes) },
			relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
		});

		// ExecDsp cho các step tổng (general steps) với dspId = null
		const now = new Date();
		const generalExecDspDoc = this.manager.create(ReleaseExecutionDsp, {
			executionId,
			dspId: null,
			status: ExecutionStatus.QUEUED,
			createdAt: now,
		});

		// ==========================================
		// TẠO SẴN TOÀN BỘ CÁC TRẠNG THÁI CON (DSP) TRÊN DATABASE VỚI STATUS QUEUED
		// ==========================================
		const dspCreatedAt = new Date(now.getTime() + 1); // +1ms để đảm bảo thứ tự
		const execDspsDocs = dsps.map((dsp) =>
			this.manager.create(ReleaseExecutionDsp, {
				executionId,
				dspId: dsp.id,
				status: ExecutionStatus.QUEUED,
				createdAt: dspCreatedAt,
			}),
		);

		const insertedDsps = await this.manager.save(ReleaseExecutionDsp, [
			generalExecDspDoc,
			...execDspsDocs,
		]);

		const generalExecDsp = insertedDsps.find((d) => !d.dspId)!;
		const execDsps = insertedDsps
			.filter((d) => Boolean(d.dspId))
			.map((doc) => ({
				execDsp: doc,
				dspOrig: dsps.find((d) => d.id === doc.dspId)!,
			}));

		// ==========================================
		// BƯỚC 2: DỰNG TRƯỚC TOÀN BỘ CHECKLIST (STEPS) VÀO DB VỚI TRẠNG THÁI PENDING
		// ==========================================
		const stepsToInsert: ReleaseExecutionStep[] = [];
		let generalOrder = 1;

		const pushGeneralStep = (
			stepType: StepType,
			aggregatorId: string | null = null,
		) => {
			stepsToInsert.push(
				this.manager.create(ReleaseExecutionStep, {
					executionDspId: generalExecDsp.id,
					aggregatorId,
					stepType,
					order: generalOrder++,
					status: StepStatus.PENDING,
				}),
			);
		};

		// Đẩy các step tổng (chung cho cả release)
		pushGeneralStep(StepType.GENERATE_UPC);
		pushGeneralStep(StepType.GENERATE_ISRC);

		// Đẩy các step riêng biệt cho từng DSP + step tổng CI (nếu có)
		let ciGeneralStepsPushed = false;

		for (const item of execDsps) {
			const config = item.dspOrig.dspRoutingConfig;
			const aggregatorId =
				config?.mode === RoutingModeEnum.AGGREGATOR && config.aggregator
					? config.aggregator.id
					: null;
			const aggCode = config?.aggregator?.code;
			const isCI =
				config?.mode === RoutingModeEnum.AGGREGATOR && aggCode === 'CI';

			let dspOrder = 1;
			const pushDspStep = (stepType: StepType) => {
				stepsToInsert.push(
					this.manager.create(ReleaseExecutionStep, {
						executionDspId: item.execDsp.id,
						aggregatorId,
						stepType,
						order: dspOrder++,
						status: StepStatus.PENDING,
					}),
				);
			};

			if (isCI) {
				// Push các step tổng CI 1 lần duy nhất
				if (!ciGeneralStepsPushed) {
					pushGeneralStep(StepType.CREATE_METADATA_CI);
					pushGeneralStep(StepType.UPLOAD_SFTP_CI);
					pushGeneralStep(StepType.CREATE_DONE_FOLDER);
					ciGeneralStepsPushed = true;
				}

				// === Luồng CI ===
				if (!item.dspOrig.hasDeal) {
					pushDspStep(StepType.EXPORT_EXCEL);
					pushDspStep(StepType.SEND_EMAIL_EXPORT);
				} else {
					pushDspStep(StepType.WAITING_EXPORT);
				}
			} else {
				// === Luồng Direct ===
				pushDspStep(StepType.CREATE_METADATA_ERN);
				pushDspStep(StepType.UPLOAD_SFTP);
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
			const isGeneral = execDsp.dspId === null;
			const steps = execDsp.steps.sort((a, b) => a.order - b.order);
			const status = await this.processDspExecution(execDsp.id, steps);

			if (status === ExecutionStatus.FAILED) {
				failedCount++;

				// Nếu bước tổng fail → dừng toàn bộ, skip tất cả DSP còn lại
				if (isGeneral) {
					const remainingExecDsps = execDsps.filter(
						(d) => d.dspId !== null,
					);
					for (const remaining of remainingExecDsps) {
						await this.manager.update(
							ReleaseExecutionDsp,
							remaining.id,
							{ status: ExecutionStatus.FAILED },
						);
						const pendingStepIds = remaining.steps
							.filter((s) => s.status === StepStatus.PENDING)
							.map((s) => s.id);
						if (pendingStepIds.length > 0) {
							await this.manager
								.createQueryBuilder()
								.update(ReleaseExecutionStep)
								.set({ status: StepStatus.SKIPPED })
								.whereInIds(pendingStepIds)
								.execute();
						}
					}
					break;
				}
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
			completedAt:
				finalStatus !== ExecutionStatus.AWAITING_ACTION
					? new Date()
					: undefined,
		});

		// SYNC: Cập nhật Release status cuối cùng
		const finalExec = await this.manager.findOne(ReleaseExecution, {
			where: { id: executionId },
		});
		if (finalExec?.releaseId) {
			let releaseStatus = ReleaseStatus.DISTRIBUTED;
			const totalDsps = execDsps.filter((d) => d.dspId !== null).length;

			if (failedCount > 0) {
				if (failedCount >= totalDsps) {
					releaseStatus = ReleaseStatus.FAILED;
				} else {
					releaseStatus = ReleaseStatus.PARTIAL_DONE;
				}
			} else if (awaitingCount > 0) {
				releaseStatus = ReleaseStatus.AWAITING_ACTION;
			}

			await this.manager.update(Release, finalExec.releaseId, {
				status: releaseStatus,
			});
		}
	}

	/**
	 * Xử lý trọn gói toàn bộ bước của 1 ExecDsp (chung hoặc riêng DSP)
	 */
	private async processDspExecution(
		execDspId: string,
		steps: ReleaseExecutionStep[],
	): Promise<ExecutionStatus> {
		// Nếu tất cả step đã xong (SUCCESS/SKIPPED) thì không chạy lại logic, chỉ trả về trạng thái
		const allDone = steps.every(
			(s) =>
				s.status === StepStatus.SUCCESS ||
				s.status === StepStatus.SKIPPED,
		);
		if (allDone) {
			return ExecutionStatus.COMPLETED;
		}

		// Nếu có ít nhất 1 step đang WAITING_ACTION, báo hiệu DSP này vẫn đang chờ
		const hasAwaiting = steps.some(
			(s) => s.status === StepStatus.WAITING_ACTION,
		);
		if (hasAwaiting) {
			return ExecutionStatus.AWAITING_ACTION;
		}

		// Bật ExecDsp sang RUNNING
		await this.manager.update(ReleaseExecutionDsp, execDspId, {
			status: ExecutionStatus.RUNNING,
		});

		// SYNC LEGACY: Cập nhật sang PROCESSING
		const initialExecDsp = await this.manager.findOne(ReleaseExecutionDsp, {
			where: { id: execDspId },
			relations: ['execution'],
		});
		if (initialExecDsp && initialExecDsp.dspId) {
			const data = {
				status: ReleaseDspStatus.PROCESSING,
				lastEnqueuedAt: new Date(),
				lastDeliveredAt: null as Date | null,
				isSelected: true,
			};
			const existed = await this.manager.findOne(ReleaseDspDelivery, {
				where: {
					releaseId: initialExecDsp.execution.releaseId,
					dspId: initialExecDsp.dspId,
				},
			});
			if (!existed) {
				await this.manager.save(ReleaseDspDelivery, {
					releaseId: initialExecDsp.execution.releaseId,
					dspId: initialExecDsp.dspId,
					...data,
				});
			} else {
				await this.manager.update(
					ReleaseDspDelivery,
					{
						releaseId: initialExecDsp.execution.releaseId,
						dspId: initialExecDsp.dspId,
					},
					data,
				);
			}
		}

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
				// Nếu 1 step bị lỗi -> ExecDsp cha báo lỗi
				await this.manager.update(ReleaseExecutionDsp, execDspId, {
					status: ExecutionStatus.FAILED,
				});

				// SYNC LEGACY: Cập nhật sang ISSUES
				if (initialExecDsp && initialExecDsp.dspId) {
					await this.manager.update(
						ReleaseDspDelivery,
						{
							releaseId: initialExecDsp.execution.releaseId,
							dspId: initialExecDsp.dspId,
						},
						{
							status: ReleaseDspStatus.ISSUES,
							lastEnqueuedAt: new Date(),
						},
					);
				}

				// SKIPPED toàn bộ các step còn sót lại chưa chạy
				const remainingStepsIds = steps.slice(i + 1).map((s) => s.id);
				if (remainingStepsIds.length > 0) {
					await this.manager
						.createQueryBuilder()
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
			await this.manager.update(ReleaseExecutionDsp, execDspId, {
				status: ExecutionStatus.AWAITING_ACTION,
			});
			return ExecutionStatus.AWAITING_ACTION;
		} else {
			await this.manager.update(ReleaseExecutionDsp, execDspId, {
				status: ExecutionStatus.COMPLETED,
			});

			// SYNC LEGACY: Cập nhật bảng release_dsp_delivery
			const execDsp = await this.manager.findOne(ReleaseExecutionDsp, {
				where: { id: execDspId },
				relations: ['execution'],
			});
			if (execDsp && execDsp.dspId) {
				await this.manager.update(
					ReleaseDspDelivery,
					{
						releaseId: execDsp.execution.releaseId,
						dspId: execDsp.dspId,
					},
					{
						status: ReleaseDspStatus.DISTRIBUTED,
						lastDeliveredAt: new Date(),
					},
				);
			}

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
			relations: [
				'execution',
				'dsp',
				'dsp.dspRoutingConfig',
				'dsp.dspRoutingConfig.aggregator',
			],
		});

		if (!execDsp)
			throw new Error(
				`Không tìm thấy ExecutionDsp ${step.executionDspId}`,
			);

		const releaseId = execDsp.execution.releaseId;
		const dspCode = execDsp.dsp?.code;

		switch (step.stepType) {
			case StepType.GENERATE_UPC: {
				this.logger.log(`[GENERATE_UPC] Release: ${releaseId}`);
				await this.releaseService.genUpcById(releaseId);
				break;
			}

			case StepType.GENERATE_ISRC: {
				this.logger.log(`[GENERATE_ISRC] Release: ${releaseId}`);
				await this.releaseService.genListIsrcByReleaseId(releaseId);
				break;
			}

			case StepType.CREATE_METADATA_ERN: {
				// Resolve config của DSP này (sender, recipient, ernVersion)
				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						dspCode!,
					);

				// Tạo metadata (XML + audio + image) trên server
				const { outputDir, batchId } =
					await this.releaseDdexService.createMetadataOnServer({
						releaseId,
						ernVersion: config.ernVersion as unknown as ErnVersion2,
						sender: config.sender,
						recipient: config.recipient,
					});

				// Lưu outputDir + batchId vào step metadata để UPLOAD_SFTP đọc lại
				await this.manager.update(ReleaseExecutionStep, step.id, {
					metadata: { outputDir, batchId, dspCode } as Record<
						string,
						any
					>,
				});

				this.logger.log(
					`[CREATE_METADATA_ERN] Release: ${releaseId} | DSP: ${dspCode} | outputDir: ${outputDir}`,
				);
				break;
			}

			case StepType.CREATE_METADATA_CI: {
				// Resolve config CI từ 1 DSP bất kỳ thuộc CI (lấy sender/recipient CI)
				// Tìm 1 execDsp thuộc CI trong cùng execution để lấy dspCode
				const execution = execDsp.execution;
				const allExecDsps = await this.manager.find(
					ReleaseExecutionDsp,
					{
						where: { executionId: execution.id },
						relations: [
							'dsp',
							'dsp.dspRoutingConfig',
							'dsp.dspRoutingConfig.aggregator',
						],
					},
				);
				const ciDspCode = allExecDsps.find(
					(d) =>
						d.dsp?.dspRoutingConfig?.mode ===
							RoutingModeEnum.AGGREGATOR &&
						d.dsp?.dspRoutingConfig?.aggregator?.code === 'CI',
				)?.dsp?.code;

				const ciConfig = ciDspCode
					? await this.dspRoutingService.resolveFullDeliveryConfig(
							ciDspCode,
						)
					: null;

				if (!ciConfig) {
					throw new Error('Không tìm thấy config CI để tạo metadata');
				}

				const { outputDir, batchId } =
					await this.releaseDdexService.createMetadataOnServer({
						releaseId,
						ernVersion: ciConfig.ernVersion as unknown as ErnVersion2,
						sender: ciConfig.sender,
						recipient: ciConfig.recipient,
					});

				await this.manager.update(ReleaseExecutionStep, step.id, {
					metadata: {
						outputDir,
						batchId,
						dspCode: ciDspCode,
					} as Record<string, any>,
				});

				this.logger.log(
					`[CREATE_METADATA_CI] Release: ${releaseId} | outputDir: ${outputDir}`,
				);
				break;
			}

			case StepType.UPLOAD_SFTP: {
				// Lấy metadata từ step CREATE_METADATA_ERN cùng DSP
				const metaStep = await this.manager.findOne(
					ReleaseExecutionStep,
					{
						where: {
							executionDspId: step.executionDspId,
							stepType: StepType.CREATE_METADATA_ERN,
						},
					},
				);
				const meta = metaStep?.metadata;
				if (!meta?.outputDir || !meta?.dspCode) {
					throw new Error(
						`Thiếu metadata từ step CREATE_METADATA_ERN của DSP ${dspCode}`,
					);
				}

				// Resolve SFTP config từ DB
				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						meta.dspCode,
					);

				await this.sftpConnectService.uploadFolder({
					sftp: config.sftp,
					localDir: meta.outputDir,
					remoteDir: config.sftp.path ?? '/',
				});

				// Cleanup local
				await removeFolder(meta.outputDir);

				this.logger.log(
					`[UPLOAD_SFTP] Release: ${releaseId} | DSP: ${dspCode} | Upload thành công`,
				);
				break;
			}

			case StepType.UPLOAD_SFTP_CI: {
				// Lấy metadata từ step CREATE_METADATA_CI (cùng executionDspId)
				const metaStep = await this.manager.findOne(
					ReleaseExecutionStep,
					{
						where: {
							executionDspId: step.executionDspId,
							stepType: StepType.CREATE_METADATA_CI,
						},
					},
				);
				const meta = metaStep?.metadata;
				if (!meta?.outputDir || !meta?.dspCode) {
					throw new Error(
						'Thiếu metadata từ step CREATE_METADATA_CI',
					);
				}

				// Resolve config CI từ dspCode đã lưu
				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						meta.dspCode,
					);

				await this.sftpConnectService.uploadFolder({
					sftp: config.sftp,
					localDir: meta.outputDir,
					remoteDir: config.sftp.path ?? '/',
				});

				// Cleanup local
				await removeFolder(meta.outputDir);

				this.logger.log(
					`[UPLOAD_SFTP_CI] Release: ${releaseId} | Upload CI thành công`,
				);
				break;
			}

			case StepType.CREATE_DONE_FOLDER: {
				// Lấy batchId từ step CREATE_METADATA_CI (cùng executionDspId)
				const metaStep = await this.manager.findOne(
					ReleaseExecutionStep,
					{
						where: {
							executionDspId: step.executionDspId,
							stepType: StepType.CREATE_METADATA_CI,
						},
					},
				);
				const meta = metaStep?.metadata;
				if (!meta?.batchId) {
					throw new Error('Thiếu batchId từ step CREATE_METADATA_CI');
				}

				// Tạo .done folder trên SFTP CI
				const ciDsp = await this.findAnyCiDspCode(execDsp.execution.id);
				if (ciDsp) {
					const config =
						await this.dspRoutingService.resolveFullDeliveryConfig(
							ciDsp,
						);
					const client = await this.sftpConnectService.connect(
						config.sftp,
					);
					try {
						const donePath = path.posix.join(
							config.sftp.path ?? '/',
							`${meta.batchId}.done`,
						);
						await client.mkdir(donePath, true);
						this.logger.log(
							`[CREATE_DONE_FOLDER] Created: ${donePath}`,
						);
					} finally {
						await client.end();
					}
				}
				break;
			}

			case StepType.EXPORT_EXCEL: {
				this.logger.log(
					`[EXPORT_EXCEL] DSP: ${dspCode} | Release: ${releaseId}`,
				);
				const buffer =
					await this.releaseService.getFileExportListReleaseCiByDspCode(
						{
							ids: [releaseId],
							dspCodeCi: [dspCode!],
						},
					);

				const baseDir =
					process.env.RELEASE_PARSED_DIR ||
					path.resolve('release_parsed');
				const tempDir = path.join(baseDir, 'temp_exports', releaseId);
				if (!fs.existsSync(tempDir))
					fs.mkdirSync(tempDir, { recursive: true });

				const fileName = `Release_${releaseId}_${dspCode}.xlsx`;
				const filePath = path.join(tempDir, fileName);
				fs.writeFileSync(filePath, buffer);

				this.logger.log(
					`[EXPORT_EXCEL] File saved at: ${path.resolve(filePath)}`,
				);

				await this.manager.update(ReleaseExecutionStep, step.id, {
					metadata: { filePath, fileName } as Record<string, any>,
				});
				break;
			}

			case StepType.SEND_EMAIL_EXPORT: {
				// Lấy file path từ step EXPORT_EXCEL trước đó của cùng DSP
				const exportStep = await this.manager.findOne(
					ReleaseExecutionStep,
					{
						where: {
							executionDspId: step.executionDspId,
							stepType: StepType.EXPORT_EXCEL,
						},
					},
				);
				const meta = exportStep?.metadata;
				if (!meta?.filePath)
					throw new Error('Không tìm thấy file export để gửi email');

				const aggregator = execDsp.dsp?.dspRoutingConfig?.aggregator;
				if (!aggregator?.deliveryEmail) {
					throw new Error(
						`[SEND_EMAIL_EXPORT] Bỏ qua gửi email cho ${dspCode} vì thiếu deliveryEmail`,
					);
				}

				const subject =
					aggregator.deliveryEmailSubject ||
					`[Distribution] Release: ${releaseId} | DSP: ${dspCode}`;
				const html = ` `;

				await this.notificationResendService.sendEmail({
					to: [aggregator.deliveryEmail],
					subject,
					html,
					attachments: [
						{
							filename: meta.fileName || 'distribution_export.xlsx',
							path: meta.filePath,
						},
					],
				});

				// Xoá file sau khi gửi xong để tránh rác server
				if (fs.existsSync(meta.filePath)) {
					fs.unlinkSync(meta.filePath);

					// Thử xoá folder release nếu rỗng
					const releaseTempDir = path.dirname(meta.filePath);
					const files = fs.readdirSync(releaseTempDir);
					if (files.length === 0) {
						fs.rmdirSync(releaseTempDir);
					}
				}

				this.logger.log(
					`[SEND_EMAIL_EXPORT] Gửi email thành công tới ${aggregator.deliveryEmail} cho DSP ${dspCode}`,
				);
				break;
			}

			case StepType.WAITING_EXPORT:
				break; // Không làm gì, chờ manual action
		}
	}

	/** Tìm dspCode thuộc CI trong 1 execution */
	private async findAnyCiDspCode(
		executionId: string,
	): Promise<string | null> {
		const allExecDsps = await this.manager.find(ReleaseExecutionDsp, {
			where: { executionId },
			relations: [
				'dsp',
				'dsp.dspRoutingConfig',
				'dsp.dspRoutingConfig.aggregator',
			],
		});
		for (const d of allExecDsps) {
			if (
				d.dsp?.dspRoutingConfig?.mode === RoutingModeEnum.AGGREGATOR &&
				d.dsp?.dspRoutingConfig?.aggregator?.code === 'CI'
			) {
				return d.dsp.code;
			}
		}
		return null;
	}

	// --- CÁC HÀM TIỆN ÍCH DƯỚI ĐÂY LÀ ĐỂ VỪA CHẠY VỪA NHÉT LOG VÀO DB --- //

	private async runStepLogic(params: {
		step: ReleaseExecutionStep;
		task: () => Promise<void>;
		keepPending?: boolean;
		maxRetries?: number;
	}) {
		const { step, task, keepPending, maxRetries = 3 } = params;
		if (
			step.status === StepStatus.SKIPPED ||
			step.status === StepStatus.SUCCESS ||
			step.status === StepStatus.WAITING_ACTION
		)
			return;

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

				this.logger.warn(
					`[STEP_RETRY] Step ${step.stepType} lần ${attempt}/${maxRetries}: ${error.message}`,
				);

				if (attempt < maxRetries) {
					// Đợi trước khi retry (3s, 6s, 9s...)
					await new Promise((r) => setTimeout(r, 3000 * attempt));
				}
			}
		}

		// Hết số lần retry → FAILED
		await this.manager.update(ReleaseExecutionStep, step.id, {
			status: StepStatus.FAILED,
			logs: lastError?.stack || lastError?.message || String(lastError),
			completedAt: new Date(),
		});
		throw lastError;
	}
}
