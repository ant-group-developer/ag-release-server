import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import * as fs from 'fs';
import path from 'path';
import {
	CI_IMPORT_MAX_EMPTY_CHECKS,
	DEFAULT_WAIT_MINUTES,
} from 'src/common/constants/common.default.constants';
import { ArtistRoleCode } from 'src/modules/artist-role/enum/artist-role.enum';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { Country } from 'src/modules/country/entities/country.entity';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { LogsService } from 'src/modules/log/services/logs.services';
import { CiToolService } from 'src/modules/partners-api/ci-tool/ci-tool.service';
import {
	QueueCiToolVevoReleasePayload,
	VevoContentProvider,
} from 'src/modules/partners-api/ci/interfaces/vevo-video.interface';
import { CiImportService } from 'src/modules/partners-api/ci/services/ci-import.service';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseErrorType } from 'src/modules/release/modules/release-errors/entities/release-error.entity';
import { ReleaseErrorService } from 'src/modules/release/modules/release-errors/services/release-error.service';
import { ReleaseReviewService } from 'src/modules/release/modules/release-reviews/services/release-review.service';
import { ReleaseDdexService } from 'src/modules/release/services/release-ddex.service';
import { ReleaseDspDeliveryService } from 'src/modules/release/services/release-dsp-services/release-dsp-delivery.service';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { ReleaseValidateService } from 'src/modules/release/services/release.validate.service';
import { Timezone } from 'src/modules/timezone/entities/timezone.entity';
import { TrackService } from 'src/modules/track/services/track.service';
import { VideoService } from 'src/modules/video/video.service';
import { removeFolder } from 'src/utils/util';
import { Readable } from 'stream';
import { EntityManager, In, IsNull } from 'typeorm';
import { ReleaseExecutionResultDto } from '../dtos/release-execution3.dto';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	CiJobType3,
	ExecutionType,
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { CiDistributionJob3Service } from './ci-distribution-job3.service';
import { VevoJobResultService } from './vevo-job-result.service';

const VEVO_WEBHOOK_WAIT_MINUTES = 30;
const VEVO_POLL_RETRY_MINUTES = 5;

type StepTaskContext = {
	step: ReleaseExecutionStep3;
	releaseExecution: ReleaseExecution3;
};

@Injectable()
export class ReleaseExecution3Worker {
	private readonly logger = new Logger(ReleaseExecution3Worker.name);

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
		private readonly logService: LogsService,
		private readonly ciImportService: CiImportService,
		private readonly releaseErrorService: ReleaseErrorService,
		private readonly releaseReviewService: ReleaseReviewService,
		private readonly ciToolService: CiToolService,
		private readonly vevoJobResultService: VevoJobResultService,
		private readonly bucketService2: BucketService2,
		private readonly releaseDspDeliveryService: ReleaseDspDeliveryService,

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

			case ReleaseExecutionStepType.REVIEW_RELEASE:
				return this.reviewRelease(context);

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

			case ReleaseExecutionStepType.GET_RESULT_IMPORT_CI:
				return this.getResultImportCi(context);

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
				return this.syncDataStatusDspCi(context);

			case ReleaseExecutionStepType.WAIT_PARTNER_PROCESS:
				return this.waitPartnerProcess(context);

			case ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER:
				return this.createMetadataOnServer(context);

			case ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP:
				return this.uploadMetadataToSftp(context);

			case ReleaseExecutionStepType.SUBMIT_VEVO_VIDEO:
				return this.submitVevoVideo(context);

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

	private async reviewRelease({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);

			const review =
				await this.releaseReviewService.findLatestByReleaseIdOrCreate({
					data: {
						releaseId,
						releaseExecutionId: releaseExecution.id,
						stepId: step.id,
					},
				});

			step.metadata = {
				...step.metadata,
				input: {
					...step.metadata?.input,
					releaseId,
				},
				output: {
					...step.metadata?.output,
					releaseReviewId: review.id,
					reviewCreated: true,
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[REVIEW_RELEASE] Review created, waiting for manual review`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
				data: { releaseId, releaseReviewId: review.id },
			});

			return ReleaseExecutionStepStatus.WAITING_ACTION;
		} catch (err) {
			this.logService.error({
				message: `[REVIEW_RELEASE] ${err.message}`,
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
		if (
			context.releaseExecution.metadata.input.dspAggregator?.ci
				?.isSkipImport
		) {
			this.logService.log({
				message: `[IMPORT_CI] Skipping import`,
				releaseExecutionId: context.releaseExecution.id,
				releaseExecutionStepId: context.step.id,
			});
			return ReleaseExecutionStepStatus.SKIPPED;
		}

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

	private async getResultImportCi({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseSnapshot =
				releaseExecution.metadata.input.releaseSnapshot;
			const releaseId = this.releaseIdFromExecution(releaseExecution);
			const upc =
				releaseSnapshot.upc ||
				releaseExecution.metadata.input.upcAutoIfReleaseSnapshotNull ||
				releaseExecution.releaseUpc;

			if (!upc) {
				throw new Error('Missing UPC from release execution');
			}

			const metadataStep = await this.getSiblingStepByType(
				step,
				ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
			);
			const batchId = metadataStep?.metadata?.output?.batchId;

			if (!batchId) {
				throw new Error(
					'Missing batchId from CREATE_METADATA_ON_SERVER step',
				);
			}

			const imports = await this.ciImportService.getImportsSimple({
				package_id: upc,
				page_size: 999,
				external_identifier: batchId,
			});

			if (imports.length === 0) {
				const previousEmptyChecks =
					Number(step.metadata?.output?.emptyCheckCount) || 0;
				const emptyCheckCount = previousEmptyChecks + 1;

				if (emptyCheckCount > CI_IMPORT_MAX_EMPTY_CHECKS) {
					step.metadata = {
						...step.metadata,
						input: {
							...step.metadata?.input,
							package_id: upc,
							external_identifier: batchId,
							page_size: 999,
						},
						output: {
							imports: [],
							errors: [],
							hasIssues: true,
							emptyCheckCount,
							lastCheckedAt: new Date().toISOString(),
						},
					};

					delete step.metadata.scheduledAt;

					await this.manager.save(ReleaseExecutionStep3, step);

					this.logService.error({
						message:
							`[GET_RESULT_IMPORT_CI] Không tìm thấy import ` +
							`sau ${emptyCheckCount} lần kiểm tra`,
						releaseExecutionId: releaseExecution.id,
						releaseExecutionStepId: step.id,
						data: {
							upc,
							batchId,
							emptyCheckCount,
						},
					});

					return ReleaseExecutionStepStatus.FAILED;
				}

				const retryDelayMinutes =
					DEFAULT_WAIT_MINUTES * Math.pow(emptyCheckCount, 3);

				const scheduledAt = new Date(
					Date.now() + retryDelayMinutes * 60 * 1000,
				);

				step.metadata = {
					...step.metadata,
					scheduledAt: scheduledAt.toISOString(),
					input: {
						...step.metadata?.input,
						package_id: upc,
						external_identifier: batchId,
						page_size: 999,
					},
					output: {
						imports: [],
						errors: [],
						hasIssues: false,
						emptyCheckCount,
						lastCheckedAt: new Date().toISOString(),
					},
				};

				await this.manager.save(ReleaseExecutionStep3, step);

				this.logService.log({
					message:
						`[GET_RESULT_IMPORT_CI] Chưa tìm thấy import, ` +
						`kiểm tra lại sau ${retryDelayMinutes} phút ` +
						`(${emptyCheckCount}/${CI_IMPORT_MAX_EMPTY_CHECKS})`,
					releaseExecutionId: releaseExecution.id,
					releaseExecutionStepId: step.id,
					data: {
						upc,
						batchId,
						emptyCheckCount,
						scheduledAt: scheduledAt.toISOString(),
					},
				});

				return ReleaseExecutionStepStatus.WAITING_PARTNER;
			}

			const errors = imports.flatMap((item: any) =>
				Array.isArray(item?.errors) ? item.errors : [],
			);
			const hasProblemStatus = imports.some(
				(item: any) =>
					String(item?.status || '').toLowerCase() === 'problem',
			);
			const errorMessages = errors.length
				? errors
				: ['Import CI trả về status problem'];

			step.metadata = {
				...step.metadata,
				input: {
					...step.metadata?.input,
					package_id: upc,
					external_identifier: batchId,
					page_size: 999,
				},
				output: {
					imports,
					errors,
					hasIssues: errors.length > 0 || hasProblemStatus,
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			if (errors.length > 0 || hasProblemStatus) {
				await this.releaseErrorService.bulkCreateErrors(
					errorMessages.map((message: string) => ({
						releaseId,
						releaseExecutionId: releaseExecution.id,
						stepId: step.id,
						type: ReleaseErrorType.IMPORT_CI,
						message,
					})),
				);

				this.logService.error({
					message: `[GET_RESULT_IMPORT_CI] Import CI has ${errorMessages.length} issue(s)`,
					releaseExecutionId: releaseExecution.id,
					releaseExecutionStepId: step.id,
					data: { upc, batchId, errors },
				});

				return ReleaseExecutionStepStatus.FAILED;
			}

			this.logService.success({
				message: `[GET_RESULT_IMPORT_CI] Import CI passed`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
				data: { upc, batchId, imports },
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[GET_RESULT_IMPORT_CI] ${err.message}`,
				releaseExecutionId: releaseExecution.id,
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
				// Xác định job type dựa vào execution type
				const jobType =
					releaseExecution.type === ExecutionType.TAKEDOWN
						? CiJobType3.ADMIN_TAKEDOWN
						: CiJobType3.ADMIN_EXPORT;

				const stepLabel =
					jobType === CiJobType3.ADMIN_TAKEDOWN
						? 'Export CI - Admin Takedown'
						: 'Export CI - Admin Export';

				await this.ciJobService.createJob({
					type: jobType,
					upc,
					dspCiCodes,
					releaseExecutionId: step.releaseExecutionId,
					stepId: step.id,
					releaseId:
						releaseExecution.metadata.input.releaseSnapshot.id,
					stepLabel,
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
				const jobType =
					releaseExecution.type === ExecutionType.TAKEDOWN
						? CiJobType3.EMAIL_STATE51_TAKEDOWN
						: CiJobType3.EMAIL_STATE51;

				await this.ciJobService.createJob({
					type: jobType,
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
			const dspCode = step.metadata?.input?.dsp?.code?.toUpperCase();

			// VEVO ưu tiên webhook; polling CI Tool khi quá thời gian chờ.
			if (dspCode === 'VEVO') {
				const scheduledAt = step.metadata?.scheduledAt;

				if (!scheduledAt) {
					step.metadata = {
						...step.metadata,
						scheduledAt: new Date(
							Date.now() + VEVO_WEBHOOK_WAIT_MINUTES * 60 * 1000,
						).toISOString(),
					};

					await this.manager.save(ReleaseExecutionStep3, step);

					return ReleaseExecutionStepStatus.WAITING_PARTNER;
				}

				if (new Date(scheduledAt) > new Date()) {
					return ReleaseExecutionStepStatus.WAITING_PARTNER;
				}

				const submitStep = await this.getSiblingStepByType(
					step,
					ReleaseExecutionStepType.SUBMIT_VEVO_VIDEO,
				);
				const jobId = submitStep?.metadata?.output?.jobId;

				if (!jobId) {
					throw new Error('Missing VEVO CI Tool jobId');
				}

				try {
					const job =
						await this.ciToolService.getVevoReleaseJob(jobId);
					const result =
						await this.vevoJobResultService.processJobResult({
							job,
							source: 'polling',
							waitStep: step,
						});

					if (result.terminal && result.status) {
						return result.status;
					}
				} catch (error) {
					step.metadata = {
						...step.metadata,
						output: {
							...step.metadata?.output,
							jobId,
							lastPollError:
								error instanceof Error
									? error.message
									: String(error),
						},
					};
				}

				step.metadata = {
					...step.metadata,
					scheduledAt: new Date(
						Date.now() + VEVO_POLL_RETRY_MINUTES * 60 * 1000,
					).toISOString(),
					output: {
						...step.metadata?.output,
						jobId,
						lastPolledAt: new Date().toISOString(),
					},
				};

				await this.manager.save(ReleaseExecutionStep3, step);

				return ReleaseExecutionStepStatus.WAITING_PARTNER;
			}

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

			const isTakedown = releaseExecution.type === ExecutionType.TAKEDOWN;

			const { outputDir, batchId, releaseReference, xml } = isTakedown
				? await this.releaseDdexService.createTakedownMetadataOnServer({
						release: releaseForMetadata,
						ernVersion: config.ernVersion,
						sender: config.sender,
						recipient: config.recipient,
						dspCode,
					})
				: await this.releaseDdexService.createMetadataOnServer({
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
					releaseReference,
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

	private async uploadGeneratedMetadataToSftp({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		let outputDir: string | undefined;

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

			outputDir = createMetadataStep?.metadata?.output?.outputDir;
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

			this.logService.success({
				message: `[UPLOAD_METADATA_TO_SFTP] DSP ${dspCode} uploaded`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (err) {
			this.logService.error({
				message: `[UPLOAD_METADATA_TO_SFTP] ${err.message}, note: Bước này nếu lỗi sẽ xoá luôn data trên server, để retry cần chạy lại cả step cha của nó để tạo lại data trên server`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});
			// return ReleaseExecutionStepStatus.DONE;
			return ReleaseExecutionStepStatus.FAILED;
		} finally {
			if (outputDir) {
				await removeFolder(outputDir);
			}
		}
	}

	private async precheckAndUploadVevoVideo({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		// let tempDir: string | undefined;
		try {
			const release = releaseExecution.metadata.input.releaseSnapshot;
			const video = release.video;

			if (!video) {
				throw new Error('Release does not contain VEVO video metadata');
			}

			if (!video?.fileId) {
				throw new Error('VEVO video file is missing');
			}

			const generatedIsrcs = await this.getGeneratedIsrcs(
				releaseExecution.id,
			);

			const videoIsrc =
				video.isrc?.trim() ||
				generatedIsrcs.videoById.get(video.id)?.trim();

			if (!videoIsrc) {
				throw new Error('Missing ISRC for VEVO video');
			}

			this.logger.log(
				`[UPLOAD_METADATA_TO_SFTP][VEVO] Checking CI Tool status for ISRC: ${videoIsrc}`,
			);
			const existing = await this.ciToolService.getVevoVideoStatus({
				isrc: videoIsrc,
			});
			this.logger.log(
				`[UPLOAD_METADATA_TO_SFTP][VEVO] CI Tool check completed: found=${existing.found}, status=${existing.status ?? 'N/A'}`,
			);

			if (existing.found && existing.status) {
				step.metadata = {
					...step.metadata,
					output: {
						...step.metadata?.output,
						isrc: videoIsrc,
						skippedUpload: true,
						precheck: {
							isrc: existing.isrc,
							status: existing.status,
							message: existing.message,
						},
						checkedAt: new Date().toISOString(),
					},
				};

				await this.manager.save(ReleaseExecutionStep3, step);

				return ReleaseExecutionStepStatus.SKIPPED;
			}

			// Chưa có release trên CI Tool.

			const config =
				await this.dspRoutingService.resolveFullDeliveryConfig('VEVO');
			this.logger.log(
				`[UPLOAD_METADATA_TO_SFTP][VEVO] Delivery config resolved: storageType=${config.sftp.type}, path=${config.sftp.path ?? ''}`,
			);

			// video.fileId đã được validate ở phía trên.
			const fileDb = await this.manager.findOne(FileEntity, {
				where: {
					id: video.fileId,
				},
			});

			if (!fileDb) {
				throw new Error(`VEVO video file not found: ${video.fileId}`);
			}

			const remoteFileName = path.basename(fileDb.fileName);

			if (!remoteFileName) {
				throw new Error('VEVO video original file name is empty');
			}

			this.logger.log(
				`[UPLOAD_METADATA_TO_SFTP][VEVO] Checking remote video file: ${remoteFileName}`,
			);
			const remoteFileExists =
				await this.sftpConnectService.vevoFileExists({
					sftp: config.sftp,
					remoteDir: '',
					fileName: remoteFileName,
				});
			this.logger.log(
				`[UPLOAD_METADATA_TO_SFTP][VEVO] Remote video check completed: file=${remoteFileName}, exists=${remoteFileExists}`,
			);

			if (remoteFileExists) {
				step.metadata = {
					...step.metadata,
					output: {
						...step.metadata?.output,
						isrc: videoIsrc,
						remoteFileName,
						skippedUpload: false,
						reusedRemoteFile: true,
						checkedAt: new Date().toISOString(),
					},
				};

				await this.manager.save(ReleaseExecutionStep3, step);

				return ReleaseExecutionStepStatus.DONE;
			}

			// tempDir = await fs.promises.mkdtemp(
			// 	path.join(os.tmpdir(), 'vevo-video-upload-'),
			// );

			// const localUploadPath = path.join(tempDir, remoteFileName);

			// await this.bucketService2.streamFileToPath({
			// 	fileId: video.fileId,
			// 	destPath: localUploadPath,
			// 	onProgress: (percent) => {
			// 		this.logger.log(
			// 			`Downloading VEVO video from R2: ${percent}% - ${remoteFileName}`,
			// 		);
			// 	},
			// });

			// await this.sftpConnectService.uploadFile({
			// 	sftp: config.sftp,
			// 	localFile: localUploadPath,
			// 	remoteDir: '',
			// });

			const contentLength = Number(fileDb.fileSize);

			if (!Number.isFinite(contentLength) || contentLength < 0) {
				throw new Error(
					`Invalid VEVO video file size: ${fileDb.fileSize}`,
				);
			}

			const partSize = 20 * 1024 * 1024; // 20 MB mỗi chunk
			const bucketService = this.bucketService2;

			// Async Generator: Cứ khi S3 cần part mới thì mới gọi R2 lấy đúng 20 MB rồi đóng kết nối ngay
			async function* makeOnDemandR2Stream() {
				let offset = 0;
				while (offset < contentLength) {
					const end = Math.min(
						offset + partSize - 1,
						contentLength - 1,
					);
					if (!video || !video.fileId) {
						throw new Error('VEVO video file is missing');
					}
					const { stream: chunkStream } =
						await bucketService.openFileStream(
							video.fileId,
							`bytes=${offset}-${end}`,
						);
					try {
						for await (const chunk of chunkStream) {
							yield chunk;
						}
					} finally {
						if (!chunkStream.destroyed) {
							chunkStream.destroy();
						}
					}
					offset = end + 1;
				}
			}

			// Tạo Readable Stream từ generator
			const input = Readable.from(makeOnDemandR2Stream());

			let lastLoggedStep = -1;
			let lastLogTime = Date.now();
			let lastLoadedBytes = 0;

			try {
				await this.sftpConnectService.uploadStreamToS3({
					storage: config.sftp,
					input,
					remoteDir: '',
					fileName: remoteFileName,
					contentLength,
					queueSize: 2,
					partSize,
					onProgress: ({ loaded, total, percent }) => {
						if (percent <= lastLoggedStep) {
							return;
						}
						lastLoggedStep = percent;

						const now = Date.now();
						const timeDeltaSec = (now - lastLogTime) / 1000;
						const bytesDelta = loaded - lastLoadedBytes;

						// Tốc độ upload tức thời (MB/s)
						const speedMBs =
							timeDeltaSec > 0
								? (
										bytesDelta /
										(1024 * 1024) /
										timeDeltaSec
									).toFixed(2)
								: '0.00';

						lastLogTime = now;
						lastLoadedBytes = loaded;

						const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
						const totalMB = (total / (1024 * 1024)).toFixed(1);

						this.logger.log(
							`[UPLOAD_METADATA_TO_SFTP][VEVO] ` +
								`Uploading video to S3: ${percent}% ` +
								`(${loadedMB}/${totalMB} MB) ` +
								`@ ${speedMBs} MB/s - ` +
								remoteFileName,
						);
					},
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				throw new Error(`VEVO_S3_STREAM_UPLOAD_FAILED: ${message}`);
			} finally {
				if (!input.destroyed) {
					input.destroy();
				}
			}

			step.metadata = {
				...step.metadata,
				output: {
					...step.metadata?.output,
					isrc: videoIsrc,
					remoteFileName,
					skippedUpload: false,
					reusedRemoteFile: false,
					uploadedAt: new Date().toISOString(),
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			return ReleaseExecutionStepStatus.DONE;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);

			this.logService.error({
				message: `[UPLOAD_METADATA_TO_SFTP][VEVO] ${message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
		// finally {
		// 	if (tempDir) {
		// 		await removeFolder(tempDir);
		// 	}
		// }
	}

	private async uploadMetadataToSftp(
		context: StepTaskContext,
	): Promise<ReleaseExecutionStepStatus> {
		const dsp = context.step.metadata?.input?.dsp;

		if (dsp?.code?.trim().toUpperCase() === 'VEVO') {
			return this.precheckAndUploadVevoVideo(context);
		}

		return this.uploadGeneratedMetadataToSftp(context);
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

			// if (dsp.code?.toUpperCase() === 'VEVO') {
			// 	const metadataStep = await this.getSiblingStepByType(
			// 		step,
			// 		ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
			// 	);
			// 	const batchId = metadataStep?.metadata?.output?.batchId;
			// 	const releaseReference =
			// 		metadataStep?.metadata?.output?.releaseReference;

			// 	if (!batchId) {
			// 		throw new Error(
			// 			'Missing batchId from CREATE_METADATA_ON_SERVER step',
			// 		);
			// 	}
			// 	if (!releaseReference) {
			// 		throw new Error('Missing ISRC for VEVO response');
			// 	}

			// 	const config =
			// 		await this.dspRoutingService.resolveFullDeliveryConfig(
			// 			dsp.code,
			// 		);

			// 	const response = await this.sftpConnectService.getVevoResponse({
			// 		sftp: config.sftp,
			// 		batchId,
			// 		releaseReference,
			// 	});

			// 	if (!response) {
			// 		throw new Error(
			// 			`VEVO response not found in batch ${batchId}`,
			// 		);
			// 	}

			// 	if (response.status === 'failure') {
			// 		step.metadata = {
			// 			...step.metadata,
			// 			output: {
			// 				...step.metadata?.output,
			// 				vevoResponseStatus: response.status,
			// 				vevoResponseKey: response.key,
			// 				vevoResponse: response.content,
			// 			},
			// 		};

			// 		await this.manager.save(ReleaseExecutionStep3, step);

			// 		this.logService.error({
			// 			message: `[SYNC_DATA_PARTNER] VEVO failed: ${this.getVevoResponseMessage(response.content)}`,
			// 			releaseExecutionId: releaseExecution.id,
			// 			releaseExecutionStepId: step.id,
			// 			data: {
			// 				vevoResponseKey: response.key,
			// 				vevoResponse: response.content,
			// 			},
			// 		});

			// 		return ReleaseExecutionStepStatus.FAILED;
			// 	}

			// 	step.metadata = {
			// 		...step.metadata,
			// 		output: {
			// 			...step.metadata?.output,
			// 			vevoResponseStatus: response.status,
			// 			vevoResponseKey: response.key,
			// 			vevoResponse: response.content,
			// 		},
			// 	};

			// 	this.logService.success({
			// 		message: `[SYNC_DATA_PARTNER] VEVO succeeded: ${this.getVevoResponseMessage(response.content)}`,
			// 		releaseExecutionId: releaseExecution.id,
			// 		releaseExecutionStepId: step.id,
			// 	});

			// 	await this.manager.save(ReleaseExecutionStep3, step);
			// }

			if (dsp.code?.toUpperCase() === 'VEVO') {
				const result =
					await this.releaseDspDeliveryService.getVevoDeliveryStatus(
						releaseExecution.releaseId,
					);

				step.metadata = {
					...step.metadata,
					output: {
						...step.metadata?.output,
						isrc: result.isrc,
						dspCode: 'VEVO',
						partnerStatus: result.partnerStatus,
						deliveryStatus: result.deliveryStatus,
						partnerMessage: result.message,
						checkedAt: result.checkedAt,
					},
				};

				await this.manager.save(ReleaseExecutionStep3, step);
			}

			this.logService.success({
				message:
					dsp.code?.toUpperCase() === 'VEVO'
						? `[SYNC_DATA_PARTNER] DSP ${dsp.name} -> ${step.metadata?.output?.deliveryStatus}`
						: `[SYNC_DATA_PARTNER] DSP ${dsp.name} -> DISTRIBUTED`,
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
		// return ReleaseExecutionStepStatus.FAILED; // dev
		// return ReleaseExecutionStepStatus.DONE;

		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);

			this.logService.log({
				message: `[VALIDATE_QA_CI] Release: ${releaseId}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			const qaFlags = await this.releaseService.getQaFlagsCi(releaseId);

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
				const tracks =
					releaseExecution.metadata.input?.releaseSnapshot?.tracks ??
					[];

				const errorsToCreate = qaFlags.map((flag) => {
					const typeInfo = flag.qa_flag_type;
					const msg =
						typeInfo?.advisor_message ||
						typeInfo?.public_name ||
						flag.type ||
						'QA Flag issue';
					const suggestion = typeInfo?.suggested_action
						? ` (Suggested action: ${typeInfo.suggested_action})`
						: '';
					const trackPart = flag.track_number
						? `Track ${flag.track_number}: `
						: '';
					const matchedTrack = flag.track_number
						? tracks.find((t: any) => t.order === flag.track_number)
						: undefined;

					return {
						releaseId,
						releaseExecutionId: releaseExecution.id,
						stepId: step.id,
						type: ReleaseErrorType.QA_FLAG_CI,
						message: `${trackPart}${msg}${suggestion}`.trim(),
						messageCode: '',
						trackId: matchedTrack?.id,
					};
				});

				await this.releaseErrorService.bulkCreateErrors(errorsToCreate);

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

	private async syncDataStatusDspCi({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const releaseId = this.releaseIdFromExecution(releaseExecution);
			const ciDspStatuses =
				await this.releaseService.getStatusDspsCi(releaseId);
			const dspStatuses = this.mergeMissingCiDspStatuses({
				step,
				releaseExecution,
				ciDspStatuses,
			});

			step.metadata = {
				...step.metadata,
				input: {
					...step.metadata?.input,
					releaseId,
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
					(item) => item.status === ReleaseDspStatus.DISTRIBUTED,
				);

			if (!allTransferred) {
				this.logService.warning({
					message: `[SYNC_DATA_DSP_CI] Not all DSPs are transferred`,
					releaseExecutionId: releaseExecution.id,
					releaseExecutionStepId: step.id,
					data: { dspStatuses },
				});
			}

			return ReleaseExecutionStepStatus.DONE;
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

	private mergeMissingCiDspStatuses({
		step,
		releaseExecution,
		ciDspStatuses,
	}: {
		step: ReleaseExecutionStep3;
		releaseExecution: ReleaseExecution3;
		ciDspStatuses: ReleaseExecutionResultDto[];
	}): ReleaseExecutionResultDto[] {
		// Merge kết quả CI trả về với danh sách DSP mà step đã yêu cầu kiểm tra.
		// Mục tiêu là đảm bảo output.result luôn có đủ từng DSP expected:
		// DSP nào CI trả status thì dùng status đó, DSP nào thiếu thì gán issues.
		// Danh sách CI code mà step này kỳ vọng phải kiểm tra.
		// CI có thể không trả status cho một vài DSP, nhưng các DSP đó vẫn cần
		// xuất hiện trong output để engine sync về release_dsp_delivery.
		const expectedCiCodes: string[] =
			step.metadata?.input?.dspCiCodes ?? [];

		if (!expectedCiCodes.length) {
			return ciDspStatuses;
		}

		// Lấy metadata DSP đã được builder phân nhóm cho CI/State51 để map
		// codeCi từ CI về dspId/dspCode nội bộ.
		const allCiDsps: Dsp[] = [
			...(releaseExecution.metadata.input.dspAggregator?.ci?.ci ?? []),
			...(releaseExecution.metadata.input.dspAggregator?.ci?.state51 ??
				[]),
		];

		// Kết quả CI trả về đang dùng dspCode nội bộ làm key.
		const statusByDspCode = new Map(
			ciDspStatuses.map((item) => [item.dspCode, item]),
		);

		return expectedCiCodes.map((ciCode) => {
			const dsp = allCiDsps.find(
				(item) => item.codeCi?.toLowerCase() === ciCode.toLowerCase(),
			);

			const existing = dsp?.code
				? statusByDspCode.get(dsp.code)
				: undefined;
			if (existing) return existing;

			// Nếu CI không trả status cho DSP đã kỳ vọng, coi là issues để UI
			// nhìn thấy DSP đó vẫn cần kiểm tra thay vì bị mất khỏi result.
			return {
				dspId: dsp?.id,
				dspCode: dsp?.code ?? ciCode,
				status: ReleaseDspStatus.ISSUES,
			};
		});
	}

	private async submitVevoVideo({
		step,
		releaseExecution,
	}: StepTaskContext): Promise<ReleaseExecutionStepStatus> {
		try {
			const release = releaseExecution.metadata.input.releaseSnapshot;
			const video = release.video;

			// Retry: request đã được CI Tool nhận thì không gửi lại.
			if (step.metadata?.output?.jobId) {
				return ReleaseExecutionStepStatus.DONE;
			}

			const uploadStep = await this.getSiblingStepByType(
				step,
				ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP,
			);

			if (!uploadStep) {
				throw new Error('VEVO upload step not found');
			}

			const uploadOutput = uploadStep.metadata?.output;

			let videoIsrc = uploadOutput?.isrc?.trim() || video?.isrc?.trim();

			if (!videoIsrc && video?.id) {
				const generatedIsrcs = await this.getGeneratedIsrcs(
					releaseExecution.id,
				);

				videoIsrc = generatedIsrcs.videoById.get(video.id)?.trim();
			}

			if (!videoIsrc) {
				throw new Error('Missing ISRC for VEVO submit');
			}

			const remoteFileName = uploadStep.metadata?.output?.remoteFileName;

			const skippedUpload =
				uploadStep.metadata?.output?.skippedUpload === true;
			const submitMode = skippedUpload ? 'update' : 'create';

			const videoFileName = skippedUpload
				? video?.videoFile?.fileName
				: uploadOutput?.remoteFileName;

			const coverArt =
				release.releaseCoverArts?.find((c) => c.type === 'original') ??
				release.releaseCoverArts?.[0];

			let thumbnailFileId =
				coverArt?.fileId ?? release.coverArtThumbnails?.original;

			if (!thumbnailFileId && release.id) {
				const dbCover = await this.manager.findOne(ReleaseCoverArt, {
					where: { releaseId: release.id },
					order: { createdAt: 'ASC' },
				});
				thumbnailFileId = dbCover?.fileId;
			}

			if (!thumbnailFileId) {
				throw new Error('Release does not contain a VEVO thumbnail');
			}

			if (!skippedUpload && !remoteFileName) {
				throw new Error('Missing remoteFileName from VEVO upload step');
			}

			let thumbnailKey = coverArt?.file?.key;
			if (!thumbnailKey) {
				const thumbnailFile = await this.manager.findOne(FileEntity, {
					where: {
						id: thumbnailFileId,
					},
				});
				thumbnailKey = thumbnailFile?.key;
			}

			if (!thumbnailKey) {
				throw new Error(
					`Thumbnail file not found or missing key: ${thumbnailFileId}`,
				);
			}

			if (!videoFileName) {
				throw new Error(
					skippedUpload
						? 'Missing video.videoFile.fileName for skipped VEVO upload'
						: 'Missing remoteFileName from VEVO upload step',
				);
			}

			const payload = await this.buildVevoSubmitPayload({
				releaseExecution,
				videoFileName,
				thumbnailKey,
				videoIsrc,
			});

			// Persist the exact outbound request before calling CI Tool so it is
			// still available for inspection when the request fails (for example 422).
			step.metadata = {
				...step.metadata,
				request: {
					mode: skippedUpload ? 'update' : 'create',
					payload,
					requestedAt: new Date().toISOString(),
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			const result = skippedUpload
				? await this.ciToolService.queueUpdateVevoRelease(payload)
				: await this.ciToolService.queueFullVevoRelease(payload);

			step.metadata = {
				...step.metadata,
				output: {
					...step.metadata?.output,
					jobId: result.jobId,
					state: result.state,
					waiting: result.waiting,
					submittedAt: new Date().toISOString(),
				},
			};

			await this.manager.save(ReleaseExecutionStep3, step);

			this.logService.success({
				message: `[SUBMIT_VEVO_VIDEO] Queued VEVO release with jobId: ${result.jobId}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
				data: {
					jobId: result.jobId,
					submitMode,
				},
			});

			return ReleaseExecutionStepStatus.DONE;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);

			this.logService.error({
				message: `[SUBMIT_VEVO_VIDEO] ${message}`,
				releaseExecutionId: releaseExecution.id,
				releaseExecutionStepId: step.id,
			});

			return ReleaseExecutionStepStatus.FAILED;
		}
	}

	private async buildVevoSubmitPayload({
		releaseExecution,
		videoFileName,
		thumbnailKey,
		videoIsrc,
	}: {
		releaseExecution: ReleaseExecution3;
		videoFileName: string;
		thumbnailKey: string;
		videoIsrc: string;
	}): Promise<QueueCiToolVevoReleasePayload> {
		const release = releaseExecution.metadata.input.releaseSnapshot;
		const video = release.video;

		if (!video) {
			throw new Error('Missing video for VEVO submit');
		}

		// 1. Primary Artists (từ release.releaseArtists)
		const primaryArtists = (release.releaseArtists ?? [])
			.map((ra) => ra.artist?.name?.trim())
			.filter((name): name is string => !!name);

		const contributorsByRole = (roleCode: ArtistRoleCode) => {
			const expectedRole = String(roleCode).toLowerCase();
			return (release.releaseContributors ?? [])
				.filter(
					(rc) =>
						rc.artistRole?.code?.trim().toLowerCase() ===
						expectedRole,
				)
				.map((rc) => rc.artist?.name?.trim())
				.filter((name): name is string => !!name);
		};

		const featuredArtists = contributorsByRole(
			ArtistRoleCode.FEATURED_ARTIST,
		);
		const editor = contributorsByRole(ArtistRoleCode.EDITOR);
		const producer = contributorsByRole(ArtistRoleCode.PRODUCER);
		const composer = contributorsByRole(ArtistRoleCode.COMPOSER);
		const director = contributorsByRole(ArtistRoleCode.DIRECTOR);

		// 3. Genres (primaryGenre & subGenre của release)
		const genres = [
			release.primaryGenre?.name,
			release.subGenre?.name,
		].filter((name): name is string => !!name?.trim());

		// 4. Language (từ release.releaseLanguage.audioLanguage)
		const language =
			release.releaseLanguage?.audioLanguage?.name?.trim() ?? null;

		// 5. Territories & Monetization
		const monetizeWorldwide = true;
		const blockedTerritories =
			await this.resolveBlockedTerritoryCodes(release);
		const repertoireOwner = video.labelEntity?.name?.trim() ?? '';

		return {
			title: release.title?.trim() ?? '',
			primaryArtists,
			featuredArtists,
			genres,
			language,
			explicit: video.explicit ? 'Yes' : 'No',
			containsAiContent: this.mapVevoAiContent(video.aiContent),
			isrc: videoIsrc,
			contentProvider: VevoContentProvider.ANT_MUSIC_LLC,
			label: repertoireOwner,
			repertoireOwner,
			channel: video.channel?.name?.trim() ?? '',
			description: video.description?.trim() ?? null,
			keywords: video.keywords ?? [],
			madeForKids: this.mapVevoMadeForKids(video.madeForKids),
			visibility: this.mapVevoVisibility(video.visibility),
			videoFile: videoFileName,
			thumbnailKey,
			startTime: this.formatVevoDateTime(
				release.releaseDate,
				release.releaseTime,
				release.timeZone,
			),
			endTime: release.releaseEndDate
				? this.formatVevoDateTime(
						release.releaseEndDate,
						release.releaseTime,
						release.timeZone,
					)
				: null,
			monetizeWorldwide,
			blockedTerritories,
			videoVersion: release?.version,
			partnerCustomId1: video.partnerCustomId1,
			partnerCustomId2: video.partnerCustomId2,
			composers: composer,
			editors: editor,
			producers: producer,
			directors: director,
			copyright: release?.cLineOwner,
			copyrightYear: release?.cLineYear,
		};
	}

	private mapVevoAiContent(value: string | null | undefined): string {
		switch (value) {
			case 'ALL':
				return 'All';
			case 'PARTLY':
				return 'Partly';
			case 'NONE':
				return 'None';
			case 'UNDETERMINED':
			default:
				return 'Undetermined';
		}
	}

	private mapVevoMadeForKids(value: string | null | undefined): string {
		switch (value) {
			case 'YES':
				return 'Yes';
			case 'NO':
				return 'No';
			case 'CHANNEL_DEFAULT':
			default:
				return 'Channel Default';
		}
	}

	private mapVevoVisibility(value: string | null | undefined): string {
		switch (value) {
			case 'UNLISTED_ON_YOUTUBE':
				return 'Unlisted on Youtube';

			case 'UNLISTED_ON_VEVO':
				return 'Unlisted on Vevo';

			case 'UNLISTED_ON_YOUTUBE_VEVO':
				return 'Unlisted on Youtube/Vevo';

			case 'DEFAULT':
			default:
				return 'Default';
		}
	}

	private formatVevoDateTime(
		date: Date | string | null | undefined,
		time: string | null | undefined,
		timeZone: Timezone | null | undefined,
	): string {
		if (!date) return '';

		let dateStr = '';
		if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
			dateStr = date.slice(0, 10);
		} else {
			const d = new Date(date);
			if (isNaN(d.getTime())) return '';
			const pad = (n: number) => String(n).padStart(2, '0');
			dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		}

		let timeStr = '00:00:00';
		if (time) {
			const trimmed = time.trim();
			if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
				timeStr = trimmed;
			} else if (/^\d{2}:\d{2}$/.test(trimmed)) {
				timeStr = `${trimmed}:00`;
			}
		}

		const offset = timeZone?.utc?.trim().replace(/^UTC\s*/i, '');
		if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) {
			return `${dateStr}T${timeStr}${offset}`;
		}

		return `${dateStr}T${timeStr}`;
	}

	private async resolveBlockedTerritoryCodes(
		release: Release,
	): Promise<string[]> {
		const territory = release.releaseTerritory;
		if (!territory || territory.distributeWorldwide) {
			return [];
		}

		const selectedIds = territory.selectedCountries ?? [];
		if (selectedIds.length === 0) {
			return [];
		}

		if (
			territory.distributionType ===
			DistributionType.DISTRIBUTE_EVERYWHERE_EXCEPT
		) {
			const countries = await this.manager.find(Country, {
				where: { id: In(selectedIds) },
				select: { iso2: true },
			});
			return countries.map((c) => c.iso2).filter(Boolean);
		}

		if (
			territory.distributionType === DistributionType.DISTRIBUTE_ONLY_IN
		) {
			const allCountries = await this.manager.find(Country, {
				select: { id: true, iso2: true },
			});
			const allowedSet = new Set(selectedIds);
			return allCountries
				.filter((c) => !allowedSet.has(c.id))
				.map((c) => c.iso2)
				.filter(Boolean);
		}

		return [];
	}
}
