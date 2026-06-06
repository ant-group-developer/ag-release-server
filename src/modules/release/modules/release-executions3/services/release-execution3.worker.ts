import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import * as fs from 'fs';
import path from 'path';
import { DEFAULT_WAIT_MINUTES } from 'src/common/constants/common.default.constants';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { LogsService } from 'src/modules/log/services/logs.services';
import { CiService } from 'src/modules/partners-api/ci/services/ci.service';
import { ReleaseDdexService } from 'src/modules/release/services/release-ddex.service';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { ReleaseValidateService } from 'src/modules/release/services/release.validate.service';
import { TrackService } from 'src/modules/track/services/track.service';
import { VideoService } from 'src/modules/video/video.service';
import { removeFolder } from 'src/utils/util';
import { EntityManager, IsNull } from 'typeorm';
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
		private readonly videoService: VideoService,
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

			case ReleaseExecutionStepType.SYNC_RESULT_TO_RELEASE:
				return this.syncResultToRelease(context);

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
			if (!upc) {
				throw new Error('Generated UPC is empty');
			}

			releaseExecution.releaseUpc = upc;
			releaseExecution.metadata = {
				...releaseExecution.metadata,
				input: {
					...releaseExecution.metadata?.input,
					upcAutoIfReleaseSnapshotNull: upc,
				},
			};

			step.metadata = {
				...step.metadata,
				output: { upc },
			};

			await this.manager.save(ReleaseExecution3, releaseExecution);
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

	private async genIsrc(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		const { step } = context;
		try {
			const trackId = step.metadata?.input?.trackId;
			const videoId = step.metadata?.input?.videoId;

			if (!trackId && !videoId) {
				throw new Error('Missing trackId or videoId in step metadata');
			}

			const isrc = trackId
				? await this.trackService.genISRC(trackId)
				: await this.videoService.genISRC(videoId);

			step.metadata = {
				...step.metadata,
				output: { isrc },
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: trackId
					? `[GEN_ISRC] Track ${trackId}: ${isrc}`
					: `[GEN_ISRC] Video ${videoId}: ${isrc}`,
				releaseExecutionId: context.releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[GEN_ISRC] ${err.message}`,
				releaseExecutionId: context.releaseExecution.id,
				releaseExecutionStepId: step.id,
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
					releaseExecutionId: releaseExecution.id,
					releaseExecutionStepId: step.id,
				});

				return ReleaseExecutionStepStatus.FAILED;
			}

			this.logService.success({
				message: `[VALIDATE] Release ${releaseId} passed`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[VALIDATE] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
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

	private async createFolderDoneCi(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		const { step } = context;
		try {
			// return ReleaseExecutionStepStatus.DONE;
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

				await client.mkdir(donePath, true);

				this.logService.success({
					message: `[CREATE_FOLDER_DONE_CI] Created: ${donePath}`,
					releaseExecutionId: context.releaseExecution.id,
					releaseExecutionStepId: step.id,
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
				releaseExecutionId: context.releaseExecution.id,
				releaseExecutionStepId: step.id,
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
				releaseExecution.releaseUpc ||
				releaseExecution.metadata.input.upcAutoIfReleaseSnapshotNull;

			if (!upc) {
				throw new Error('Missing UPC from release execution');
			}

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

				this.logService.success({
					message: `[WAITING_ADMIN_EXPORT] Job created`,
					releaseExecutionId: releaseExecution.id,
					releaseExecutionStepId: step.id,
					data: { upc, dspCiCodes },
				});
			}

			return ReleaseExecutionStepStatus.WAITING_ACTION;
		} catch (err) {
			this.logService.error({
				message: `[WAITING_ADMIN_EXPORT] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
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
				releaseExecution.releaseUpc ||
				releaseExecution.metadata.input.upcAutoIfReleaseSnapshotNull;

			if (!upc) {
				throw new Error('Missing UPC from release execution');
			}

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
					input: {
						...step.metadata?.input,
						deliveryEmail,
						deliveryEmailSubject,
					},
					output: {
						jobCreated: true,
					},
				};
				await this.manager.save(ReleaseExecutionStep3, step);
			}

			this.logService.success({
				message: `[SEND_EMAIL_STATE51] Job created, sent to ${deliveryEmail}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.WAITING_ACTION;
		} catch (err) {
			this.logService.error({
				message: `[SEND_EMAIL_STATE51] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async waitPartnerProcess(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		const { step } = context;
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
				releaseExecutionId: context.releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.WAITING_PARTNER;
		} catch (err) {
			this.logService.error({
				message: `[WAIT_PARTNER_PROCESS] ${err.message}`,
				releaseExecutionId: context.releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async createMetadataOnServer({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		console.log('Creating metadata on server...');

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

			const releaseSnapshot =
				releaseExecution.metadata.input.releaseSnapshot;
			const upc =
				releaseSnapshot.upc ||
				releaseExecution.metadata.input.upcAutoIfReleaseSnapshotNull ||
				releaseExecution.releaseUpc;
			const generatedIsrcs = await this.getGeneratedIsrcs(
				releaseExecution.id,
			);

			// Patch UPC/ISRC only on a cloned release used for metadata;
			// releaseSnapshot must stay as the original execution input.
			const releaseForMetadata = this.buildReleaseForMetadata({
				releaseSnapshot,
				upc,
				generatedIsrcs,
			});

			const { outputDir, batchId, xml } =
				await this.releaseDdexService.createMetadataOnServer({
					release: releaseForMetadata,
					ernVersion: config.ernVersion,
					sender: config.sender,
					recipient: config.recipient,
					dspCode,
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
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[CREATE_METADATA_ON_SERVER] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async getGeneratedIsrcs(releaseExecutionId: string): Promise<{
		trackById: Map<string, string>;
		videoById: Map<string, string>;
	}> {
		const isrcSteps = await this.manager.find(ReleaseExecutionStep3, {
			where: {
				releaseExecutionId,
				type: ReleaseExecutionStepType.GEN_ISRC,
				status: ReleaseExecutionStepStatus.DONE,
			},
		});

		const trackById = new Map<string, string>();
		const videoById = new Map<string, string>();

		for (const isrcStep of isrcSteps) {
			const isrc = isrcStep.metadata?.output?.isrc;
			if (!isrc) continue;

			const trackId = isrcStep.metadata?.input?.trackId;
			if (trackId) {
				trackById.set(trackId, isrc);
				continue;
			}

			const videoId = isrcStep.metadata?.input?.videoId;
			if (videoId) {
				videoById.set(videoId, isrc);
			}
		}

		return { trackById, videoById };
	}

	private buildReleaseForMetadata({
		releaseSnapshot,
		upc,
		generatedIsrcs,
	}: {
		releaseSnapshot: any;
		upc?: string;
		generatedIsrcs: {
			trackById: Map<string, string>;
			videoById: Map<string, string>;
		};
	}) {
		const shouldPatchUpc = !!upc && upc !== releaseSnapshot.upc;
		let hasPatchedTrack = false;
		const tracks = releaseSnapshot.tracks?.map((track: any) => {
			const isrc = generatedIsrcs.trackById.get(track.id);

			if (!isrc || track.isrc) return track;

			hasPatchedTrack = true;
			return Object.assign(
				Object.create(Object.getPrototypeOf(track)),
				track,
				{
					isrc,
				},
			);
		});
		const videoIsrc = releaseSnapshot.video
			? generatedIsrcs.videoById.get(releaseSnapshot.video.id)
			: undefined;
		const shouldPatchVideoIsrc =
			!!videoIsrc && !releaseSnapshot.video?.isrc;

		if (!shouldPatchUpc && !shouldPatchVideoIsrc && !hasPatchedTrack) {
			return releaseSnapshot;
		}

		return Object.assign(
			Object.create(Object.getPrototypeOf(releaseSnapshot)),
			releaseSnapshot,
			{
				...(shouldPatchUpc ? { upc } : {}),
				...(hasPatchedTrack ? { tracks } : {}),
				...(shouldPatchVideoIsrc
					? {
							video: Object.assign(
								Object.create(
									Object.getPrototypeOf(
										releaseSnapshot.video,
									),
								),
								releaseSnapshot.video,
								{ isrc: videoIsrc },
							),
						}
					: {}),
			},
		);
	}

	private async uploadMetadataToSftp({
		step,
		releaseExecution,
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

			await this.sftpConnectService.uploadFolder({
				sftp: config.sftp,
				localDir: outputDir,
				remoteDir: config.sftp.path ?? '/',
			});
			// }

			await removeFolder(outputDir);

			this.logService.success({
				message: `[UPLOAD_METADATA_TO_SFTP] DSP ${dspCode} uploaded`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[UPLOAD_METADATA_TO_SFTP] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});
			// return ReleaseExecutionStepStatus.DONE;
			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncResultToRelease({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		return await ReleaseExecutionStepStatus.DONE;
	}

	private getAllFilesRecursive(
		dirPath: string,
		originalDirPath: string = dirPath,
	): { localPath: string; relativePath: string }[] {
		const files = fs.readdirSync(dirPath);
		let fileList: { localPath: string; relativePath: string }[] = [];

		for (const file of files) {
			const absolutePath = path.join(dirPath, file);
			if (fs.statSync(absolutePath).isDirectory()) {
				fileList = fileList.concat(
					this.getAllFilesRecursive(absolutePath, originalDirPath),
				);
			} else {
				fileList.push({
					localPath: absolutePath,
					relativePath: path.relative(originalDirPath, absolutePath),
				});
			}
		}

		return fileList;
	}

	private async syncDataFromDsp({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			console.log('Syncing data from DSP...');

			const parent = await this.getParentStep(step);

			const dsp =
				step.metadata?.input?.dsp ?? parent?.metadata?.input?.dsps?.[0];

			if (!dsp) {
				throw new Error('Missing dsp from step or parent step');
			}

			if (dsp.code?.toUpperCase() === 'VEVO') {
				const metadataStep = await this.getSiblingStepByType(
					step,
					ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
				);
				const batchId = metadataStep?.metadata?.output?.batchId;
				const upc =
					releaseExecution.metadata.input
						.upcAutoIfReleaseSnapshotNull ||
					releaseExecution.metadata?.input?.releaseSnapshot?.upc;

				if (!batchId) {
					throw new Error(
						'Missing batchId from CREATE_METADATA_ON_SERVER step',
					);
				}
				if (!upc) throw new Error('Missing UPC for VEVO response');

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						dsp.code,
					);

				const response = await this.sftpConnectService.getVevoResponse({
					sftp: config.sftp,
					batchId,
					upc,
				});

				if (!response) {
					throw new Error(
						`VEVO response not found in batch ${batchId}`,
					);
				}

				if (response.status === 'failure') {
					step.metadata = {
						...step.metadata,
						output: {
							...step.metadata?.output,
							vevoResponseStatus: response.status,
							vevoResponseKey: response.key,
							vevoResponse: response.content,
						},
					};

					await this.manager.save(ReleaseExecutionStep3, step);

					this.logService.error({
						message: `[SYNC_DATA_PARTNER] VEVO failed: ${this.getVevoResponseMessage(response.content)}`,
						releaseExecutionId: releaseExecution.id,
						releaseExecutionStepId: step.id,
						data: {
							vevoResponseKey: response.key,
							vevoResponse: response.content,
						},
					});

					return ReleaseExecutionStepStatus.FAILED;
				}

				step.metadata = {
					...step.metadata,
					output: {
						...step.metadata?.output,
						vevoResponseStatus: response.status,
						vevoResponseKey: response.key,
						vevoResponse: response.content,
					},
				};

				this.logService.success({
					message: `[SYNC_DATA_PARTNER] VEVO succeeded: ${this.getVevoResponseMessage(response.content)}`,
					releaseExecutionId: releaseExecution.id,
					releaseExecutionStepId: step.id,
				});

				await this.manager.save(ReleaseExecutionStep3, step);
			}

			this.logService.success({
				message: `[SYNC_DATA_PARTNER] DSP ${dsp.name} -> DISTRIBUTED`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[SYNC_DATA_PARTNER] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private getVevoResponseMessage(content: unknown): string {
		if (typeof content === 'string') return content;
		if (content && typeof content === 'object') {
			const response = content as Record<string, unknown>;
			const message = response.errorMessage ?? response.error;
			if (typeof message === 'string') return message;
		}

		try {
			return JSON.stringify(content);
		} catch {
			return 'Unknown VEVO response error';
		}
	}

	private async validateQaCi({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		// return ReleaseExecutionStepStatus.FAILED;
		// return ReleaseExecutionStepStatus.DONE;

		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);

			this.logService.log({
				message: `[VALIDATE_QA_CI] Release: ${releaseId}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
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
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[VALIDATE_QA_CI] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async syncDataDspCi({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const upc =
				releaseExecution.metadata?.input?.releaseSnapshot?.upc ||
				releaseExecution.metadata.input.upcAutoIfReleaseSnapshotNull;

			if (!upc) {
				throw new Error('Missing UPC from release snapshot');
			}

			const dspCiCodes: string[] =
				step.metadata?.input?.dspCiCodes ??
				[
					...(releaseExecution.metadata.input.dspAggregator?.ci?.ci ??
						[]),
					...(releaseExecution.metadata.input.dspAggregator?.ci
						?.state51 ?? []),
				]
					.map((dsp) => dsp.codeCi)
					.filter((code): code is string => !!code);

			const dspStatuses = await this.ciService.getStatusDsps({
				upc,
				dspCiCodes,
			});

			step.metadata = {
				...step.metadata,
				input: {
					...step.metadata?.input,
					upc,
					dspCiCodes,
				},
				output: {
					...step.metadata?.output,
					result: dspStatuses,
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			const allTransferred =
				dspStatuses.length > 0 &&
				dspStatuses.every(
					(item) => item.status?.toLowerCase() === 'transferred',
				);

			if (allTransferred) {
				this.logService.success({
					message: `[SYNC_DATA_DSP_CI] All ${dspStatuses.length} DSPs transferred`,
					releaseExecutionId: releaseExecution.id,
					releaseExecutionStepId: step.id,
					data: { dspStatuses },
				});

				return ReleaseExecutionStepStatus.DONE;
			}

			this.logService.error({
				message: `[SYNC_DATA_DSP_CI] Not all DSPs are transferred`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
				data: { dspStatuses },
			});

			return ReleaseExecutionStepStatus.FAILED;
		} catch (err) {
			this.logService.error({
				message: `[SYNC_DATA_DSP_CI] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
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
