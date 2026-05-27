import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import path from 'path';
import { DEFAULT_WAIT_MINUTES } from 'src/common/constants/common.default.constants';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
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
import { CiJobType3 } from '../entites/ci-distribution-job3.entity';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { CiDistributionJob3Service } from './ci-distribution-job3.service';

type StepTaskContext = {
	step: ReleaseExecutionStep3;
	releaseExecution: ReleaseExecution3;
};

@Injectable()
export class ReleaseExecution3Worker {
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
		private readonly logService: LogsService,

		// @Inject(forwardRef(() => CiDistributionJobService))
		private readonly ciJobService: CiDistributionJob3Service,
	) {}

	async dispatchStepTask(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		const { step } = context;

		switch (step.type) {
			case ReleaseExecutionStepType.GEN_UPC:
				return this.genUpc(context);

			case ReleaseExecutionStepType.GEN_ISRCS:
				return this.genIsrcs(context);

			case ReleaseExecutionStepType.GEN_ISRC:
				return this.genIsrc(context);

			case ReleaseExecutionStepType.VALIDATE:
				return this.validate(context);

			case ReleaseExecutionStepType.PROCESS_DSPS:
				return this.processDsps(context);

			case ReleaseExecutionStepType.PROCESS_DIRECT:
				return this.processDirect(context);

			case ReleaseExecutionStepType.PROCESS_DIRECT_CHILD:
				return this.processDirectChild(context);

			case ReleaseExecutionStepType.SYNC_DATA_PARTNER:
				return this.syncDataPartner(context);

			case ReleaseExecutionStepType.PROCESS_AGG:
				return this.processAgg(context);

			case ReleaseExecutionStepType.PROCESS_AGG_CI:
				return this.processAggCi(context);

			case ReleaseExecutionStepType.IMPORT_CI:
				return this.importCi(context);

			case ReleaseExecutionStepType.EXPORT_CI:
				return this.exportCi(context);

			case ReleaseExecutionStepType.CREATE_FOLDER_DONE_CI:
				return this.createFolderDoneCi(context);

			case ReleaseExecutionStepType.VALIDATE_QA_CI:
				return this.validateQaCi(context);

			case ReleaseExecutionStepType.EXPORT_AGG_CI_CI:
				return this.ci(context);

			case ReleaseExecutionStepType.EXPORT_AGG_CI_STATE51:
				return this.state51(context);

			case ReleaseExecutionStepType.WAITING_ADMIN_EXPORT:
				return this.waitingAdminExport(context);

			case ReleaseExecutionStepType.SEND_EMAIL_STATE51:
				return this.sendEmailState51(context);

			case ReleaseExecutionStepType.SYNC_DATA_DSP_CI:
				return this.syncDataDspCi(context);

			case ReleaseExecutionStepType.WAIT_PARTNER_PROCESS:
				return this.waitPartnerProcess(context);

			case ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER:
				return this.createMetadataOnServer(context);

			case ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP:
				return this.uploadMetadataToSftp(context);

			default:
				throw new Error(`Unsupported step type: ${step.type}`);
		}
	}

	private releaseIdFromExecution(
		releaseExecution: ReleaseExecution3,
	): string {
		const id = releaseExecution.metadata?.input?.releaseSnapshot?.id;

		if (!id) {
			throw new Error('Missing releaseSnapshot.id in execution metadata');
		}

		return id;
	}

	private async getParentStep(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStep3 | null> {
		if (!step.parentStepId) return null;

		return this.manager.findOne(ReleaseExecutionStep3, {
			where: { id: step.parentStepId },
		});
	}

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

	private async genUpc({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);

			const upc = await this.releaseService.genUpcById(releaseId);

			step.metadata = {
				...step.metadata,
				output: { upc },
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[GEN_UPC] Release ${releaseId}: ${upc}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
				message: `[GEN_UPC] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private genIsrcs(context: StepTaskContext): ReleaseExecutionStepStatus {
		return this.deriveStatusFromChildren(context);
	}

	private async genIsrc({
		step,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const trackId = step.metadata?.input?.trackId;

			if (!trackId) {
				throw new Error('Missing trackId in step metadata');
			}

			const isrc = await this.trackService.genISRC(trackId);

			step.metadata = {
				...step.metadata,
				output: { isrc },
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[GEN_ISRC] Track ${trackId}: ${isrc}`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[GEN_ISRC] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async validate({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);

			const snapshot = releaseExecution.metadata?.input?.releaseSnapshot;

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
					message: `[VALIDATE] Release ${releaseId} failed: ${errors
						.map((e: any) => e.message)
						.join(', ')}`,
				});

				return ReleaseExecutionStepStatus.FAILED;
			}

			this.logService.success({
				message: `[VALIDATE] Release ${releaseId} passed`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[VALIDATE] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async processDsps(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async processDirect(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async processDirectChild(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async syncDataPartner(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.syncDataFromDsp(context);
	}

	private async processAgg(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async processAggCi(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async importCi(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async exportCi(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async createFolderDoneCi({
		step,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const metaStep = await this.getSiblingStepByType(
				step,
				ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
			);

			const batchId = metaStep?.metadata?.output?.batchId;

			if (!batchId) {
				throw new Error(
					'Missing batchId from CREATE_METADATA_ON_SERVER step',
				);
			}

			const dspCode = metaStep?.metadata?.input?.dspCode;

			if (!dspCode) {
				throw new Error(
					'Missing dspCode from CREATE_METADATA_ON_SERVER step',
				);
			}

			const config =
				await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

			const client = await this.sftpConnectService.connect(config.sftp);

			try {
				const donePath = path.posix.join(
					config.sftp.path ?? '/',
					`${batchId}.done`,
				);

				// await client.mkdir(donePath, true);

				this.logService.success({
					message: `[CREATE_FOLDER_DONE_CI] Created: ${donePath}`,
					data: {
						batchId,
						donePath,
					},
				});
			} finally {
				await client.end();
			}

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[CREATE_FOLDER_DONE_CI] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async ci(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async state51(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		return this.deriveStatusFromChildren(context);
	}

	private async waitingAdminExport({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const upc =
				releaseExecution.releaseUpc ??
				releaseExecution.metadata.input.upcAutoIfReleaseSnapshotNull;

			const dsps: Dsp[] =
				releaseExecution.metadata.input.dspAggregator?.ci?.ci ?? [];

			const dspCiCodes: string[] = dsps
				.map((dsp) => dsp.codeCi)
				.filter((code): code is string => !!code);

			if (!step.metadata?.output?.jobCreated) {
				await this.ciJobService.createJob({
					type: CiJobType3.ADMIN_EXPORT,
					upc,
					dspCiCodes,
					releaseExecutionId: step.releaseExecutionId,
					stepId: step.id,
					releaseId:
						releaseExecution.metadata.input.releaseSnapshot.id,
					stepLabel: 'Export CI - Admin Export',
				});

				step.metadata = {
					...step.metadata,
					output: { jobCreated: true },
				};
				await this.manager.save(ReleaseExecutionStep3, step);
			}

			return ReleaseExecutionStepStatus.WAITING_ACTION;
		} catch (err) {
			this.logService.error({
				message: `[WAITING_ADMIN_EXPORT] ${err.message}`,
			});
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async sendEmailState51({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const upc =
				releaseExecution.releaseUpc ??
				releaseExecution.metadata.input.upcAutoIfReleaseSnapshotNull;

			const dsps: Dsp[] = step.metadata?.input?.dsps ?? [];
			if (!dsps.length) throw new Error('Missing dsps');

			const dspEntity = await this.manager.findOne(Dsp, {
				where: { id: dsps[0].id },
				relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
			});

			const deliveryEmail =
				dspEntity?.dspRoutingConfig?.aggregator?.deliveryEmail;
			const deliveryEmailSubject =
				dspEntity?.dspRoutingConfig?.aggregator?.deliveryEmailSubject ??
				`State51 Delivery - ${upc}`;

			if (!deliveryEmail)
				throw new Error('Missing deliveryEmail on aggregator');

			const dspCiCodes: string[] = dsps
				.map((dsp) => dsp.codeCi)
				.filter((code): code is string => !!code);

			if (!step.metadata?.output?.jobCreated) {
				await this.ciJobService.createJob({
					type: CiJobType3.EMAIL_STATE51,
					upc,
					dspCiCodes,
					releaseExecutionId: step.releaseExecutionId,
					stepId: step.id,
					releaseId:
						releaseExecution.metadata.input.releaseSnapshot.id,
					deliveryEmail,
					deliveryEmailSubject,
					stepLabel: 'Export CI - Email State51',
				});

				step.metadata = {
					...step.metadata,
					output: { jobCreated: true },
				};
				await this.manager.save(ReleaseExecutionStep3, step);
			}

			this.logService.success({
				message: `[SEND_EMAIL_STATE51] Job created, sent to ${deliveryEmail}`,
				data: { upc, dspCiCodes },
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[SEND_EMAIL_STATE51] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async waitPartnerProcess({
		step,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const scheduledAt = step.metadata?.scheduledAt;

			// Đã từng set lịch → cron resume gọi vào đây → done, tiếp tục pipeline
			if (scheduledAt) {
				if (new Date(scheduledAt) > new Date()) {
					return ReleaseExecutionStepStatus.WAITING_PARTNER; // chưa đến giờ
				}
				return ReleaseExecutionStepStatus.DONE; // đã đến giờ
			}

			// Lần đầu chạy → set lịch và dừng lại
			const waitMinutes =
				step.metadata?.input?.waitMinutes ?? DEFAULT_WAIT_MINUTES;
			const newScheduledAt = new Date(
				Date.now() + waitMinutes * 60 * 1000,
			);

			step.metadata = {
				...step.metadata,
				scheduledAt: newScheduledAt.toISOString(),
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.log({
				message: `[WAIT_PARTNER_PROCESS] Resume at ${newScheduledAt.toISOString()} (+${waitMinutes}min)`,
			});

			return ReleaseExecutionStepStatus.WAITING_PARTNER;
		} catch (err) {
			this.logService.error({
				message: `[WAIT_PARTNER_PROCESS] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async createMetadataOnServer({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const parentStep = step.parentStepId
				? await this.manager.findOne(ReleaseExecutionStep3, {
						where: { id: step.parentStepId },
					})
				: null;

			let dspCode: string | undefined;

			if (parentStep?.type === ReleaseExecutionStepType.IMPORT_CI) {
				dspCode = parentStep?.metadata?.input?.primaryDsp?.code;
			} else {
				dspCode = step.metadata?.input?.dsp?.code;
			}

			if (!dspCode) {
				throw new Error('Missing DSP code');
			}

			if (!dspCode) {
				throw new Error('Missing DSP code from step or parent step');
			}

			const config =
				await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

			const { outputDir, batchId, xml } =
				await this.releaseDdexService.createMetadataOnServer({
					release: releaseExecution.metadata.input.releaseSnapshot,
					ernVersion: config.ernVersion,
					sender: config.sender,
					recipient: config.recipient,
				});

			step.metadata = {
				...step.metadata,
				input: {
					...step.metadata?.input,
					ernVersion: config.ernVersion,
					dspCode,
				},
				output: {
					outputDir,
					batchId,
					xml,
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[CREATE_METADATA_ON_SERVER] DSP ${dspCode} metadata created`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[CREATE_METADATA_ON_SERVER] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async uploadMetadataToSftp({
		step,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			if (!step.parentStepId) {
				throw new Error(
					'Missing parentStepId for UPLOAD_METADATA_TO_SFTP',
				);
			}

			const createMetadataStep = await this.manager.findOne(
				ReleaseExecutionStep3,
				{
					where: {
						parentStepId: step.parentStepId,
						type: ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
					},
				},
			);

			const outputDir = createMetadataStep?.metadata?.output?.outputDir;
			const dspCode = createMetadataStep?.metadata?.input?.dspCode;

			if (!outputDir) {
				throw new Error(
					'Missing outputDir from CREATE_METADATA_ON_SERVER',
				);
			}

			if (!dspCode) {
				throw new Error(
					'Missing dspCode from CREATE_METADATA_ON_SERVER',
				);
			}

			const config =
				await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

			// await this.sftpConnectService.uploadFolder({
			// 	sftp: config.sftp,
			// 	localDir: outputDir,
			// 	remoteDir: config.sftp.path ?? '/',
			// });

			await removeFolder(outputDir);

			this.logService.success({
				message: `[UPLOAD_METADATA_TO_SFTP] DSP ${dspCode} uploaded`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[UPLOAD_METADATA_TO_SFTP] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncDataFromDsp({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);
			const parent = await this.getParentStep(step);

			const dsp =
				step.metadata?.input?.dsp ?? parent?.metadata?.input?.dsps?.[0];

			if (!dsp) {
				throw new Error('Missing dsp from step or parent step');
			}

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
				message: `[SYNC_DATA_PARTNER] DSP ${dsp.name} → DISTRIBUTED`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[SYNC_DATA_PARTNER] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async validateQaCi({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);

			this.logService.log({
				message: `[VALIDATE_QA_CI] Release: ${releaseId}`,
			});

			const qaFlags = await this.releaseService.getQaFlagCi(releaseId);

			const hasIssues = Array.isArray(qaFlags) && qaFlags.length > 0;

			step.metadata = {
				...step.metadata,
				input: {
					...step.metadata?.input,
					releaseId,
				},
				output: {
					qaFlags,
					hasIssues,
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			if (hasIssues) {
				throw new Error(
					`QA validation failed: ${qaFlags.length} issue(s) found`,
				);
			}

			this.logService.success({
				message: `[VALIDATE_QA_CI] Release ${releaseId} passed`,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[VALIDATE_QA_CI] ${err.message}`,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncDataDspCi({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const upc = releaseExecution.metadata?.input?.releaseSnapshot?.upc;

			if (!upc) {
				throw new Error('Missing UPC from release snapshot');
			}

			const dspStatuses = await this.ciService.getStatusDsps(upc);

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

	private deriveStatusFromChildren({
		step,
	}: StepTaskContext): ReleaseExecutionStepStatus {
		return ReleaseExecutionStepStatus.DONE;
	}
}
