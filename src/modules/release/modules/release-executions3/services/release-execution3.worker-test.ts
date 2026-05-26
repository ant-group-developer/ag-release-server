import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { DEFAULT_WAIT_MINUTES } from 'src/common/constants/common.default.constants';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { LogsService } from 'src/modules/log/services/logs.services';
import { CiService } from 'src/modules/partners-api/ci/services/ci.service';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseDdexService } from 'src/modules/release/services/release-ddex.service';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { ReleaseValidateService } from 'src/modules/release/services/release.validate.service';
import { TrackService } from 'src/modules/track/services/track.service';
import { removeFolder } from 'src/utils/util';
import { EntityManager, In, IsNull } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';

@Injectable()
export class ReleaseExecution3WorkerTest {
	constructor(
		@InjectEntityManager()
		private readonly manager: EntityManager,

		private readonly dspRoutingService: DspRoutingConfigsService,
		private readonly sftpConnectService: SftpConnectService,
		private readonly releaseDdexService: ReleaseDdexService,
		private readonly releaseValidateService: ReleaseValidateService,

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,
		private readonly trackService: TrackService,
		private readonly ciService: CiService,
		// private readonly ciJobService: CiDistributionJobService,
		private readonly logService: LogsService,
	) {}

	// ─────────────────────────────────────────────
	// DISPATCHER
	// ─────────────────────────────────────────────

	async dispatchStepTask({
		step,
		releaseExecution,
	}: {
		step: ReleaseExecutionStep3;
		releaseExecution: ReleaseExecution3;
	}): Promise<ReleaseExecutionStepStatus> {
		switch (step.type) {
			case ReleaseExecutionStepType.GEN_UPC:
				return this.genUpc({ step, releaseExecution });

			case ReleaseExecutionStepType.GEN_ISRCS:
				return this.genIsrcs(step);

			case ReleaseExecutionStepType.GEN_ISRC:
				return this.genIsrc(step);

			case ReleaseExecutionStepType.VALIDATE:
				return this.validate(step);

			// case ReleaseExecutionStepType.CREATE_AND_UPLOAD_DIRECT:
			//     return this.createAndUploadDirect(step);

			// case ReleaseExecutionStepType.SYNC_DATA_FROM_DSP:
			//     return this.syncDataFromDsp(step);

			// case ReleaseExecutionStepType.CREATE_AND_UPLOAD_CI:
			//     return this.createAndUploadCi(step);

			// case ReleaseExecutionStepType.CREATE_FOLDER_DONE_CI:
			// 	return this.createFolderDoneCi(step);

			case ReleaseExecutionStepType.VALIDATE_QA_CI:
				return this.validateQaCi(step);

			// case ReleaseExecutionStepType.EXPORT_CI:
			//     return this.exportCi(step);

			// case ReleaseExecutionStepType.SEND_EMAIL_TO_STATE:
			//     return this.sendEmailToState(step);

			case ReleaseExecutionStepType.WAITING_ADMIN_EXPORT:
				return ReleaseExecutionStepStatus.WAITING_ACTION;

			case ReleaseExecutionStepType.WAIT_PARTNER_PROCESS:
				return this.waitPartnerProcess(step);

			case ReleaseExecutionStepType.SYNC_DATA_DSP_CI:
				return this.syncDataDspCi(step);

			case ReleaseExecutionStepType.PROCESS_DIRECT:
			case ReleaseExecutionStepType.PROCESS_AGG_CI:
				// return this.deriveStatusFromChildren(step);

			default:
				throw new Error(`Unsupported step type: ${step.type}`);
		}
	}

	// ─────────────────────────────────────────────
	// HELPERS — context
	// ─────────────────────────────────────────────

	/** Lấy execution cha của step để đọc metadata/snapshot */
	private async getExecution(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecution3> {
		const execution = await this.manager.findOne(ReleaseExecution3, {
			where: { id: step.releaseExecutionId },
		});
		if (!execution) {
			throw new Error(
				`ReleaseExecution3 ${step.releaseExecutionId} not found`,
			);
		}
		return execution;
	}

	private releaseIdFromExecution(execution: ReleaseExecution3): string {
		const id = execution.metadata?.input?.releaseSnapshot?.id;
		if (!id)
			throw new Error('Missing releaseSnapshot.id in execution metadata');
		return id;
	}

	/** Lấy step cha của step hiện tại */
	private async getParentStep(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStep3 | null> {
		if (!step.parentStepId) return null;
		return this.manager.findOne(ReleaseExecutionStep3, {
			where: { id: step.parentStepId },
		});
	}

	/** Lấy sibling step cùng cha, theo type */
	private async getSiblingStepByType(
		step: ReleaseExecutionStep3,
		type: ReleaseExecutionStepType,
	): Promise<ReleaseExecutionStep3 | null> {
		return this.manager.findOne(ReleaseExecutionStep3, {
			where: {
				releaseExecutionId: step.releaseExecutionId,
				parentStepId: step.parentStepId ?? IsNull(),
				type,
			},
		});
	}

	// ─────────────────────────────────────────────
	// CRITICAL STEPS
	// ─────────────────────────────────────────────

	private async genUpc({
		step,
		releaseExecution,
	}: {
		step: ReleaseExecutionStep3;
		releaseExecution: ReleaseExecution3;
	}): Promise<ReleaseExecutionStepStatus> {
		try {
			const data = releaseExecution.metadata;

			const upc = await this.releaseService.genUpcById(
				data.input.releaseSnapshot.id,
			);

			// // Ghi output vào step metadata
			step.metadata = {
				...step.metadata,
				output: { upc },
			};
			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[GEN_UPC] Release ${data.input.releaseSnapshot.id}: ${upc}`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({ message: `[GEN_UPC] ${err.message}` });
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async genIsrcs(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {

		return ReleaseExecutionStepStatus.DONE
		// return this.deriveStatusFromChildren(step);
	}

	private async genIsrc(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const trackId = step.metadata?.input?.trackId;
			if (!trackId) throw new Error('Missing trackId in step metadata');

			const isrc = await this.trackService.genISRC(trackId);

			step.metadata = {
				...step.metadata,
				output: { isrc },
			};
			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[GEN_ISRC] Track ${trackId} → ${isrc}`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({ message: `[GEN_ISRC] ${err.message}` });
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async validate(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const execution = await this.getExecution(step);
			const releaseId = this.releaseIdFromExecution(execution);
			const snapshot = execution.metadata?.input?.releaseSnapshot;

			const errors =
				this.releaseValidateService.getErrorsSchemaRelease(snapshot);

			step.metadata = {
				...step.metadata,
				output: {
					valid: errors.length === 0,
					errors,
				},
			};
			await this.manager.save(ReleaseExecutionStep3, step);

			if (errors.length > 0) {
				this.logService.error({
					message: `[VALIDATE] Release ${releaseId} failed: ${errors.map((e: any) => e.message).join(', ')}`,
				});
				return ReleaseExecutionStepStatus.FAILED;
			}

			this.logService.success({
				message: `[VALIDATE] Release ${releaseId} passed`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({ message: `[VALIDATE] ${err.message}` });
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	// ─────────────────────────────────────────────
	// DIRECT DSP SUB-STEPS
	// ─────────────────────────────────────────────

	private async createAndUploadDirect(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const execution = await this.getExecution(step);
			const parent = await this.getParentStep(step);
			const dspCode = parent?.metadata?.input?.dsps?.[0]?.code;
			if (!dspCode) throw new Error('Missing DSP code from parent step');

			const config =
				await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

			const { outputDir, batchId, xml } =
				await this.releaseDdexService.createMetadataOnServer({
					release: execution.metadata.input.releaseSnapshot,
					ernVersion: config.ernVersion as unknown as ErnVersion2,
					sender: config.sender,
					recipient: config.recipient,
				});

			await this.sftpConnectService.uploadFolder({
				sftp: config.sftp,
				localDir: outputDir,
				remoteDir: config.sftp.path ?? '/',
			});

			await removeFolder(outputDir);

			step.metadata = {
				...step.metadata,
				input: { ernVersion: config.ernVersion, dspCode },
				output: { outputDir, batchId, xml },
			};
			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[CREATE_AND_UPLOAD_DIRECT] DSP ${dspCode} uploaded, batchId=${batchId}`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[CREATE_AND_UPLOAD_DIRECT] ${err.message}`,
			});
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncDataFromDsp(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const execution = await this.getExecution(step);
			const releaseId = this.releaseIdFromExecution(execution);
			const parent = await this.getParentStep(step);
			const dsp = parent?.metadata?.input?.dsps?.[0];
			if (!dsp) throw new Error('Missing dsp from parent step');

			await this.manager
				.createQueryBuilder()
				.insert()
				.into(ReleaseDspDelivery)
				.values({
					releaseId,
					dspId: dsp.id,
					isSelected: true,
					status: ReleaseDspStatus.DISTRIBUTED,
					lastDeliveredAt: new Date(),
				})
				.orUpdate(
					['status', 'last_delivered_at', 'is_selected'],
					['release_id', 'dsp_id'],
				)
				.execute();

			this.logService.success({
				message: `[SYNC_DATA_FROM_DSP] DSP ${dsp.name} → DISTRIBUTED`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[SYNC_DATA_FROM_DSP] ${err.message}`,
			});
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	// ─────────────────────────────────────────────
	// CI AGGREGATOR SUB-STEPS
	// ─────────────────────────────────────────────

	private async createAndUploadCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const execution = await this.getExecution(step);
			const parent = await this.getParentStep(step);
			const ciDsps: Dsp[] = parent?.metadata?.input?.dsps || [];
			if (ciDsps.length === 0) throw new Error('No CI DSPs found');

			// Bỏ annotation — để TypeScript tự infer
			let ciDsp: Dsp | null = null;
			let config: Awaited<
				ReturnType<
					DspRoutingConfigsService['resolveFullDeliveryConfig']
				>
			> | null = null;

			for (const dspRef of ciDsps) {
				const candidate = await this.manager.findOne(Dsp, {
					where: { id: dspRef.id },
					relations: [
						'dspRoutingConfig',
						'dspRoutingConfig.aggregator',
					],
				});
				if (!candidate?.code) continue;
				try {
					const candidateConfig =
						await this.dspRoutingService.resolveFullDeliveryConfig(
							candidate.code,
						);
					if (candidateConfig) {
						ciDsp = candidate;
						config = candidateConfig;
						break;
					}
				} catch {
					continue;
				}
			}

			if (!ciDsp || !config)
				throw new Error('No CI DSP with valid config found');

			const { outputDir, batchId, xml } =
				await this.releaseDdexService.createMetadataOnServer({
					release: execution.metadata.input.releaseSnapshot,
					ernVersion: config.ernVersion as unknown as ErnVersion2,
					sender: config.sender,
					recipient: config.recipient,
				});

			await this.sftpConnectService.uploadFolder({
				sftp: config.sftp,
				localDir: outputDir,
				remoteDir: config.sftp.path ?? '/',
			});

			await removeFolder(outputDir);

			step.metadata = {
				...step.metadata,
				input: { ernVersion: config.ernVersion, dspCode: ciDsp.code },
				output: { outputDir, batchId, xml },
			};
			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[CREATE_AND_UPLOAD_CI] batchId=${batchId} uploaded`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[CREATE_AND_UPLOAD_CI] ${err.message}`,
			});
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	// private async createFolderDoneCi(
	// 	step: ReleaseExecutionStep3,
	// ): Promise<ReleaseExecutionStepStatus> {
	// 	try {
	// 		const metaStep = await this.getSiblingStepByType(
	// 			step,
	// 			ReleaseExecutionStepType.CREATE_AND_UPLOAD_CI,
	// 		);
	// 		const batchId = metaStep?.metadata?.output?.batchId;
	// 		if (!batchId)
	// 			throw new Error(
	// 				'Missing batchId from CREATE_AND_UPLOAD_CI step',
	// 			);

	// 		const dspCode = metaStep?.metadata?.input?.dspCode;
	// 		if (!dspCode)
	// 			throw new Error(
	// 				'Missing dspCode from CREATE_AND_UPLOAD_CI step',
	// 			);

	// 		const config =
	// 			await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

	// 		const client = await this.sftpConnectService.connect(config.sftp);
	// 		try {
	// 			const donePath = path.posix.join(
	// 				config.sftp.path ?? '/',
	// 				`${batchId}.done`,
	// 			);
	// 			await client.mkdir(donePath, true);
	// 			this.logService.success({
	// 				message: `[CREATE_FOLDER_DONE_CI] Created ${donePath}`,
	// 			});
	// 		} finally {
	// 			await client.end();
	// 		}

	// 		return ReleaseExecutionStepStatus.DONE;
	// 	} catch (err) {
	// 		this.logService.error({
	// 			message: `[CREATE_FOLDER_DONE_CI] ${err.message}`,
	// 		});
	// 		return ReleaseExecutionStepStatus.FAILED;
	// 	}
	// }

	private async validateQaCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const execution = await this.getExecution(step);
			const releaseId = this.releaseIdFromExecution(execution);

			// const qaFlags = await this.releaseService.getQaFlagCi(releaseId);
			// const hasIssues = Array.isArray(qaFlags) && qaFlags.length > 0;

			// step.metadata = {
			// 	...step.metadata,
			// 	output: { qaFlags, hasIssues },
			// };
			// await this.manager.save(ReleaseExecutionStep3, step);

			// if (hasIssues) {
			// 	this.logService.error({
			// 		message: `[VALIDATE_QA_CI] ${qaFlags.length} issue(s) found`,
			// 	});
			// 	return ReleaseExecutionStepStatus.FAILED;
			// }

			this.logService.success({ message: `[VALIDATE_QA_CI] Passed` });
			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[VALIDATE_QA_CI] ${err.message}`,
			});
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	// private async exportCi(
	// 	step: ReleaseExecutionStep3,
	// ): Promise<ReleaseExecutionStepStatus> {
	// 	try {
	// 		const execution = await this.getExecution(step);
	// 		const releaseId = this.releaseIdFromExecution(execution);
	// 		const upc = execution.metadata?.input?.releaseSnapshot?.upc;
	// 		const exportInput = step.metadata?.input || {};

	// 		// Email State51 jobs
	// 		const state51DspCodes: string[] = exportInput.state51DspCodes || [];
	// 		const state51DspsData: any[] = exportInput.state51Dsps || [];

	// 		if (state51DspCodes.length > 0) {
	// 			const ciDsp =
	// 				state51DspsData.length > 0
	// 					? await this.manager.findOne(Dsp, {
	// 							where: { id: state51DspsData[0].id },
	// 							relations: [
	// 								'dspRoutingConfig',
	// 								'dspRoutingConfig.aggregator',
	// 							],
	// 						})
	// 					: null;

	// 			const deliveryEmail =
	// 				ciDsp?.dspRoutingConfig?.aggregator?.deliveryEmail;
	// 			const deliveryEmailSubject =
	// 				ciDsp?.dspRoutingConfig?.aggregator?.deliveryEmailSubject;

	// 			if (!deliveryEmail) {
	// 				throw new Error(
	// 					'Missing deliveryEmail on aggregator for state51 DSPs',
	// 				);
	// 			}

	// 			await this.ciJobService.createJob({
	// 				type: CiJobType.EMAIL_STATE51,
	// 				upc,
	// 				dspCiCodes: state51DspCodes,
	// 				releaseExecutionId: step.releaseExecutionId,
	// 				stepId: step.id,
	// 				releaseId,
	// 				deliveryEmail,
	// 				deliveryEmailSubject,
	// 				stepLabel: 'Export CI - Email State51',
	// 			});
	// 		}

	// 		// Admin export jobs
	// 		const ciDealDspCodes: string[] = exportInput.ciDealDspCodes || [];
	// 		if (ciDealDspCodes.length > 0) {
	// 			await this.ciJobService.createJob({
	// 				type: CiJobType.ADMIN_EXPORT,
	// 				upc,
	// 				dspCiCodes: ciDealDspCodes,
	// 				releaseExecutionId: step.releaseExecutionId,
	// 				stepId: step.id,
	// 				releaseId,
	// 				stepLabel: 'Export CI - Admin Export',
	// 			});
	// 		}

	// 		this.logService.success({
	// 			message: `[EXPORT_CI] Jobs created, step → WAITING_ACTION`,
	// 			data: { upc, state51DspCodes, ciDealDspCodes },
	// 		});

	// 		// Luôn trả WAITING_ACTION — runner sẽ resume khi CI jobs xong
	// 		return ReleaseExecutionStepStatus.WAITING_ACTION;
	// 	} catch (err) {
	// 		this.logService.error({ message: `[EXPORT_CI] ${err.message}` });
	// 		return ReleaseExecutionStepStatus.FAILED;
	// 	}
	// }

	private async sendEmailToState(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			// TODO: implement send email logic
			return ReleaseExecutionStepStatus.DONE;
		} catch {
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async waitPartnerProcess(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const waitMinutes =
				step.metadata?.input?.waitMinutes ?? DEFAULT_WAIT_MINUTES;
			const scheduledAt = new Date(Date.now() + waitMinutes * 60 * 1000);

			step.metadata = {
				...step.metadata,
				scheduledAt: scheduledAt.toISOString(),
			};
			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.log({
				message: `[WAIT_PARTNER_PROCESS] Resume at ${scheduledAt.toISOString()} (+${waitMinutes}min)`,
			});

			return ReleaseExecutionStepStatus.WAITING_ACTION;
		} catch (err) {
			this.logService.error({
				message: `[WAIT_PARTNER_PROCESS] ${err.message}`,
			});
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncDataDspCi(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		try {
			const execution = await this.getExecution(step);
			const upc = execution.metadata?.input?.releaseSnapshot?.upc;
			if (!upc) throw new Error('Missing UPC from release snapshot');

			const dspStatuses = await this.ciService.getStatusDsps(upc);

			// Map CI code → system Dsp
			const ciCodes = dspStatuses.map((d) => d.ciCode).filter(Boolean);
			const dsps =
				ciCodes.length > 0
					? await this.manager.find(Dsp, {
							where: { codeCi: In(ciCodes) },
						})
					: [];
			const ciToSystem = new Map(
				dsps.map((d) => [d.codeCi, { code: d.code, name: d.name }]),
			);

			const mappedStatuses = dspStatuses.map((d) => ({
				ciCode: d.ciCode,
				code: ciToSystem.get(d.ciCode)?.code || null,
				name: ciToSystem.get(d.ciCode)?.name || null,
				status: d.status,
			}));

			step.metadata = {
				...step.metadata,
				output: {
					...step.metadata?.output,
					result: mappedStatuses,
				},
			};
			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[SYNC_DATA_DSP_CI] ${mappedStatuses.length} DSPs synced`,
				data: { dspStatuses: mappedStatuses },
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[SYNC_DATA_DSP_CI] ${err.message}`,
			});
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	// ─────────────────────────────────────────────
	// STATUS AGGREGATION
	// ─────────────────────────────────────────────

	// private deriveStatusFromChildren(
	// 	step: ReleaseExecutionStep3,
	// ): ReleaseExecutionStepStatus {
	// 	const children = step.childSteps || [];

	// 	if (!children.length) return step.status;

	// 	if (
	// 		children.some(
	// 			(c) => c.status === ReleaseExecutionStepStatus.WAITING_ACTION,
	// 		)
	// 	)
	// 		return ReleaseExecutionStepStatus.WAITING_ACTION;

	// 	if (
	// 		children.some(
	// 			(c) => c.status === ReleaseExecutionStepStatus.WAITING_PARTNER,
	// 		)
	// 	)
	// 		return ReleaseExecutionStepStatus.WAITING_PARTNER;

	// 	if (
	// 		children.some((c) => c.status === ReleaseExecutionStepStatus.FAILED)
	// 	)
	// 		return ReleaseExecutionStepStatus.FAILED;

	// 	if (
	// 		children.every(
	// 			(c) => c.status === ReleaseExecutionStepStatus.CANCELLED,
	// 		)
	// 	)
	// 		return ReleaseExecutionStepStatus.CANCELLED;

	// 	if (children.every((c) => c.status === ReleaseExecutionStepStatus.DONE))
	// 		return ReleaseExecutionStepStatus.DONE;

	// 	return ReleaseExecutionStepStatus.PROCESSING;
	// }
}
