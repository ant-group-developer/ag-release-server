import {
	Inject,
	Injectable,
	NotFoundException,
	forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { DEFAULT_WAIT_MINUTES } from 'src/common/constants/common.default.constants';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { LogsService } from 'src/modules/log/services/logs.services';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { CiService } from 'src/modules/partners-api/ci/services/ci.service';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { ReleaseDdexService } from 'src/modules/release/services/release-ddex.service';
import { ReleaseQueryService } from 'src/modules/release/services/release.query.service';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { ReleaseValidateService } from 'src/modules/release/services/release.validate.service';
import { Track } from 'src/modules/track/entities/track.entity';
import { TrackService } from 'src/modules/track/services/track.service';
import { removeFolder } from 'src/utils/util';
import {
	EntityManager,
	In,
	IsNull,
	LessThanOrEqual,
	Not,
	Repository,
} from 'typeorm';
import {
	QueryGetListSubmitDto,
	ReleaseSubmitResultDto,
} from '../dto/release-submit.dto';
import {
	CiDistributionJob,
	CiJobStatus,
	CiJobType,
} from '../entities/ci-distribution-job.entity';
import { ReleaseSubmitStep } from '../entities/release-submit-step.entity';
import {
	ExecutionType,
	ReleaseSubmit,
} from '../entities/release-submit.entity';
import {
	ReleaseSubmitStatus,
	SubmitStepStatus,
	SubmitStepType,
} from '../release-submit.enum';
import { CiDistributionJobService } from './ci-distribution-job.service';

@Injectable()
export class ReleaseSubmitService2 {
	private readonly DISTRIBUTION_TYPES = [
		SubmitStepType.PROCESS_DIRECT,
		SubmitStepType.PROCESS_AGG_CI,
	];
	directChildTypes: SubmitStepType[] = [
		SubmitStepType.CREATE_AND_UPLOAD_DIRECT,
		SubmitStepType.WAIT_PARTNER_PROCESS,
		SubmitStepType.SYNC_DATA_FROM_DSP,
	];

	constructor(
		@InjectRepository(ReleaseSubmit)
		private readonly submitRepo: Repository<ReleaseSubmit>,

		@InjectRepository(ReleaseSubmitStep)
		private readonly stepRepo: Repository<ReleaseSubmitStep>,

		@InjectEntityManager()
		private readonly manager: EntityManager,

		private readonly releaseQueryService: ReleaseQueryService,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly dspRoutingService: DspRoutingConfigsService,
		private readonly releaseDdexService: ReleaseDdexService,
		private readonly sftpConnectService: SftpConnectService,
		private readonly trackService: TrackService,

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,
		private readonly logService: LogsService,

		@Inject(forwardRef(() => CiDistributionJobService))
		private readonly ciJobService: CiDistributionJobService,

		private readonly ciService: CiService,
	) {}

	async submit({
		releaseId,
		dspCodes,
		type,
	}: {
		releaseId: string;
		dspCodes: string[];
		type: ExecutionType;
	}) {
		// Cancel submit cũ chưa hoàn thành
		await this.cancelPendingSubmits(releaseId);

		// Lấy full release data để snapshot
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId,
		});

		// Tạo ReleaseSubmit ở trạng thái NEW
		const submit = this.submitRepo.create({
			releaseId,
			status: ReleaseSubmitStatus.NEW,
			releaseTitle: release.title ?? '',
			releaseUpc: release.upc ?? '',
			type,
			metadata: {
				input: {
					dspCodes,
					releaseSnapshot: release,
				},
			},
		});
		const saved = await this.submitRepo.save(submit);

		// Set release to PROCESSING
		await this.manager.update(Release, releaseId, {
			status: ReleaseStatus.PROCESSING,
		});

		// Mark tất cả DSPs được chọn → PROCESSING trong ReleaseDspDelivery
		await this.markDspDeliveriesProcessing(releaseId, dspCodes);

		this.logService.log({
			releaseSubmitId: saved.id,
			message: 'Submit created, starting async processing',
			data: { releaseId, dspCodes },
		});

		// Fire-and-forget: bắt đầu xử lý bất đồng bộ
		this.processAsync(saved.id).catch((err) => {
			this.logService.error({
				releaseSubmitId: saved.id,
				message: `processAsync failed: ${err.message}`,
				data: { stack: err.stack },
			});
		});
		return saved;
	}

	private async processAsync(submitId: string) {
		const submit = await this.findOne(submitId);
		const dspCodes = submit.metadata?.input?.dspCodes || [];
		try {
			// Phase 1: Tạo toàn bộ steps (plan)
			await this.buildPipeline(submitId, dspCodes);

			// Phase 2: Chạy tuần tự các parent steps
			await this.runPipeline(submitId);
		} catch (err) {
			this.logService.error({
				releaseSubmitId: submitId,
				message: `Fatal error: ${err.message}`,
				data: { stack: err.stack },
			});
			await this.submitRepo.update(submitId, {
				status: ReleaseSubmitStatus.FAILED,
				summary: err.message,
			});
			await this.markDspDeliveriesFailed(submit.releaseId, dspCodes);
			await this.deriveAndUpdateReleaseStatus(submit.releaseId);
		}
	}

	// private
	private async cancelPendingSubmits(releaseId: string) {
		const pendingStatuses = [
			ReleaseSubmitStatus.NEW,
			ReleaseSubmitStatus.PROCESSING,
			ReleaseSubmitStatus.WAITING_ACTION,
		];

		// Tìm submits pending
		const pendingSubmits = await this.submitRepo.find({
			where: { releaseId, status: In(pendingStatuses) },
			select: ['id'],
		});

		if (pendingSubmits.length === 0) return;

		const submitIds = pendingSubmits.map((s) => s.id);

		// Cancel submits
		await this.submitRepo
			.createQueryBuilder()
			.update()
			.set({
				status: ReleaseSubmitStatus.CANCELLED,
				completedAt: new Date(),
			})
			.where('id IN (:...ids)', { ids: submitIds })
			.execute();

		// Skip steps chưa chạy
		await this.stepRepo
			.createQueryBuilder()
			.update()
			.set({ status: SubmitStepStatus.SKIPPED })
			.where('release_submit_id IN (:...ids)', { ids: submitIds })
			.andWhere('status IN (:...stepStatuses)', {
				stepStatuses: [
					SubmitStepStatus.NEW,
					SubmitStepStatus.WAITING_ACTION,
				],
			})
			.execute();

		// Skip pending CI distribution jobs
		await this.manager
			.createQueryBuilder()
			.update(CiDistributionJob)
			.set({ status: CiJobStatus.SKIPPED })
			.where('release_submit_id IN (:...ids)', { ids: submitIds })
			.andWhere('status IN (:...jobStatuses)', {
				jobStatuses: [CiJobStatus.PENDING, CiJobStatus.PROCESSING],
			})
			.execute();
	}

	// private async markDspDeliveriesProcessing(
	// 	releaseId: string,
	// 	dspCodes: string[],
	// ) {
	// 	if (!dspCodes?.length) return;

	// 	const dsps = await this.manager.find(Dsp, {
	// 		where: { code: In(dspCodes) },
	// 	});

	// 	for (const dsp of dsps) {
	// 		const existed = await this.manager.findOne(ReleaseDspDelivery, {
	// 			where: { releaseId, dspId: dsp.id },
	// 		});

	// 		if (existed) {
	// 			await this.manager.update(
	// 				ReleaseDspDelivery,
	// 				{ releaseId, dspId: dsp.id },
	// 				{
	// 					status: ReleaseDspStatus.PROCESSING,
	// 					lastEnqueuedAt: new Date(),
	// 				},
	// 			);
	// 		} else {
	// 			await this.manager.save(ReleaseDspDelivery, {
	// 				releaseId,
	// 				dspId: dsp.id,
	// 				isSelected: true,
	// 				status: ReleaseDspStatus.PROCESSING,
	// 				lastEnqueuedAt: new Date(),
	// 			});
	// 		}
	// 	}
	// }

	private async markDspDeliveriesProcessing(
		releaseId: string,
		dspCodes: string[],
	) {
		if (!dspCodes?.length) return;

		const dsps = await this.manager.find(Dsp, {
			where: { code: In(dspCodes) },
			select: ['id'],
		});

		if (!dsps.length) return;

		const now = new Date();

		await this.manager
			.createQueryBuilder()
			.insert()
			.into(ReleaseDspDelivery)
			.values(
				dsps.map((dsp) => ({
					releaseId,
					dspId: dsp.id,
					isSelected: true,
					status: ReleaseDspStatus.PROCESSING,
					lastEnqueuedAt: now,
				})),
			)
			.orUpdate(
				['status', 'last_enqueued_at'], // columns to update on conflict
				['release_id', 'dsp_id'], // conflict target (unique constraint)
			)
			.execute();
	}

	private async buildPipeline(submitId: string, dspCodes: string[]) {
		const submit = await this.findOne(submitId);

		await this.submitRepo.update(submitId, {
			status: ReleaseSubmitStatus.PROCESSING,
		});

		const snapshot = submit.metadata?.input?.releaseSnapshot;

		const stepsToInsert: Partial<ReleaseSubmitStep>[] = [];
		let parentOrder = 1;

		// GEN_UPC (nếu chưa có UPC)
		if (!snapshot?.upc) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.GEN_UPC,
				order: parentOrder++,
			});
		}

		const tracksWithoutIsrc =
			snapshot?.tracks?.filter((t: Track) => !t.isrc) || [];
		if (tracksWithoutIsrc.length > 0) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.GEN_ISRCS,
				order: parentOrder++,
				metadata: {
					input: {
						trackIds: tracksWithoutIsrc.map((t: any) => t.id),
					},
				},
			});
		}

		// VALIDATE
		stepsToInsert.push({
			releaseSubmitId: submitId,
			type: SubmitStepType.VALIDATE,
			order: parentOrder++,
		});

		// --- DSP steps ---
		let dsps: Dsp[] = [];
		if (dspCodes?.length) {
			dsps = await this.manager.find(Dsp, {
				where: { code: In(dspCodes) },
				relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
			});
		}

		// Phân loại DSPs: direct vs CI aggregator
		const directDsps: Dsp[] = [];
		const ciDsps: Dsp[] = [];

		for (const dsp of dsps) {
			const config = dsp.dspRoutingConfig;
			const isCI =
				config?.mode === RoutingModeEnum.AGGREGATOR &&
				config.aggregator?.code === 'CI';

			if (isCI) {
				ciDsps.push(dsp);
			} else {
				directDsps.push(dsp);
			}
		}

		// PROCESS_DIRECT — 1 parent step per DSP
		for (const dsp of directDsps) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.PROCESS_DIRECT,
				order: parentOrder++,
				metadata: { input: { dsps: [dsp] } },
			});
		}

		// PROCESS_AGG_CI — 1 parent step cho tất cả CI DSPs
		if (ciDsps.length > 0) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.PROCESS_AGG_CI,
				order: parentOrder++,
				metadata: { input: { dsps: ciDsps } },
			});
		}

		// Save parent steps
		const savedParents = await this.stepRepo.save(
			stepsToInsert.map((s) => this.stepRepo.create(s)),
		);

		// --- Child steps ---
		const childStepsToInsert: Partial<ReleaseSubmitStep>[] = [];

		for (const parent of savedParents) {
			if (parent.type === SubmitStepType.GEN_ISRCS) {
				// 1 child per track
				const trackIds = parent.metadata?.input?.trackIds || [];
				trackIds.forEach((trackId: string, i: number) => {
					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type: SubmitStepType.GEN_ISRC,
						order: i + 1,
						metadata: { input: { trackId } },
					});
				});
			}

			if (parent.type === SubmitStepType.PROCESS_DIRECT) {
				let directOrder = 1;
				const directChildTypes: SubmitStepType[] = [
					SubmitStepType.CREATE_AND_UPLOAD_DIRECT,
					SubmitStepType.WAIT_PARTNER_PROCESS,
					SubmitStepType.SYNC_DATA_FROM_DSP,
				];
				for (const type of directChildTypes) {
					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type,
						order: directOrder++,
						...(type === SubmitStepType.WAIT_PARTNER_PROCESS && {
							metadata: {
								input: { waitMinutes: DEFAULT_WAIT_MINUTES },
							},
						}),
					});
				}
			}

			if (parent.type === SubmitStepType.PROCESS_AGG_CI) {
				const ciDsps: Dsp[] = parent.metadata?.input?.dsps || [];
				const upc = snapshot?.upc;

				// Tách DSPs: có deal CI vs cần State51
				const ciDealDsps = ciDsps.filter((d: Dsp) => d.hasDeal);
				const state51Dsps = ciDsps.filter((d: Dsp) => !d.hasDeal);

				let childOrder = 1;

				// xulici
				// Steps chung — luôn tạo
				const commonTypes: SubmitStepType[] = [
					SubmitStepType.CREATE_AND_UPLOAD_CI,
					SubmitStepType.CREATE_FOLDER_DONE_CI,
					SubmitStepType.WAIT_PARTNER_PROCESS,
					SubmitStepType.VALIDATE_QA_CI,
				];

				for (const type of commonTypes) {
					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type,
						order: childOrder++,
						...(type === SubmitStepType.WAIT_PARTNER_PROCESS && {
							metadata: {
								input: { waitMinutes: DEFAULT_WAIT_MINUTES },
							},
						}),
					});
				}

				// EXPORT_CI — 1 step duy nhất tạo tất cả CI jobs (email + admin export)
				if (state51Dsps.length > 0 || ciDealDsps.length > 0) {
					const state51DspCodes = state51Dsps
						.map((d: Dsp) => d.codeCi)
						.filter((code: string): code is string => !!code);
					const ciDealDspCodes = ciDealDsps
						.map((d: Dsp) => d.codeCi)
						.filter((code: string): code is string => !!code);

					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type: SubmitStepType.EXPORT_CI,
						order: childOrder++,
						metadata: {
							input: {
								upc,
								state51Dsps,
								state51DspCodes,
								ciDealDsps,
								ciDealDspCodes,
							},
						},
					});
				}

				// WAIT_PARTNER_PROCESS — xử lý sau khi nhận export (1 ngày)
				childStepsToInsert.push({
					releaseSubmitId: submitId,
					parentStepId: parent.id,
					type: SubmitStepType.WAIT_PARTNER_PROCESS,
					order: childOrder++,
					metadata: { input: { waitMinutes: 1440 } },
					// metadata: { input: { waitMinutes: 1 } },
				});

				// SYNC_DATA_DSP_CI — luôn tạo, sync tất cả ciDsps
				childStepsToInsert.push({
					releaseSubmitId: submitId,
					parentStepId: parent.id,
					type: SubmitStepType.SYNC_DATA_DSP_CI,
					order: childOrder++,
				});
			}
		}

		// Save all child steps once
		if (childStepsToInsert.length > 0) {
			await this.stepRepo.save(
				childStepsToInsert.map((s) => this.stepRepo.create(s)),
			);
		}

		this.logService.success({
			releaseSubmitId: submitId,
			message: `Plan created: ${savedParents.length} parent steps, ${childStepsToInsert.length} child steps`,
			data: { parentTypes: savedParents.map((s) => s.type) },
		});
	}

	// phân loại các bước cha thành dừng nếu lỗi hoặc không dừng nếu lỗi
	// xử lý các bước cha, nếu cha lỗi thì dừng toàn bộ hoặc skip,
	// tính toán status submit, các dsp delivery, nếu fail thì lưu lỗi vào dsp delivery
	private async runPipeline(submitId: string) {
		// Lấy tất cả parent steps (theo order)
		const parentSteps = await this.stepRepo.find({
			where: { releaseSubmitId: submitId, parentStepId: IsNull() },
			order: { order: 'ASC' },
			relations: ['childSteps'],
		});

		// Phân loại: critical (blocking) vs distribution (independent branches)
		const criticalSteps = parentSteps.filter(
			(s) => !this.DISTRIBUTION_TYPES.includes(s.type),
		);
		const distributionSteps = parentSteps.filter((s) =>
			this.DISTRIBUTION_TYPES.includes(s.type),
		);

		// Phase 1: Critical steps — tuần tự, fail = dừng toàn bộ
		// nếu fail,
		// cập nhật thằng con skip,
		// cập trạng thái chính nó, lưu log,
		// cập nhật deliveries + Release status
		for (const step of criticalSteps) {
			if (step.status === SubmitStepStatus.DONE) continue;
			if (step.status === SubmitStepStatus.SKIPPED) continue;

			const success = await this.runStep(step);

			if (!success) {
				await this.skipRemainingSteps(submitId, 0);
				await this.submitRepo.update(submitId, {
					status: ReleaseSubmitStatus.FAILED,
					completedAt: new Date(),
				});

				this.logService.error({
					releaseSubmitId: submitId,
					releaseSubmitStepId: step.id,
					message: `Critical step ${step.type} failed, submit marked FAILED`,
				});

				// Update DSP deliveries + Release status
				const failedSubmit = await this.submitRepo.findOne({
					where: { id: submitId },
				});

				if (failedSubmit) {
					const failedDspCodes =
						failedSubmit.metadata?.input?.dspCodes || [];
					await this.markDspDeliveriesFailed(
						failedSubmit.releaseId,
						failedDspCodes,
					);
					await this.deriveAndUpdateReleaseStatus(
						failedSubmit.releaseId,
					);
				}
				return;
			}
		}

		// Phase 2: Distribution steps — chạy tuần tự, các branch độc lập
		const pendingDistSteps = distributionSteps.filter(
			(s) =>
				s.status !== SubmitStepStatus.DONE &&
				s.status !== SubmitStepStatus.SKIPPED &&
				s.status !== SubmitStepStatus.FAILED,
		);

		for (const distStep of pendingDistSteps) {
			await this.runStep(distStep);
		}

		// await Promise.allSettled(
		// 	pendingDistSteps.map((step) => this.runStep(step)),
		// );

		await this.resolveSubmitStatus(submitId);
	}

	/**
	 * Cập nhật DSP deliveries đang PROCESSING → ISSUES cho các DSP codes chỉ định
	 */
	private async markDspDeliveriesFailed(
		releaseId: string,
		dspCodes: string[],
	) {
		if (!dspCodes?.length) return;

		const dsps = await this.manager.find(Dsp, {
			where: { code: In(dspCodes) },
		});

		const dspIds = dsps.map((d) => d.id);
		if (!dspIds.length) return;

		await this.manager.update(
			ReleaseDspDelivery,
			{
				releaseId,
				dspId: In(dspIds),
				status: ReleaseDspStatus.PROCESSING,
			},
			{ status: ReleaseDspStatus.ISSUES },
		);
	}

	/**
	 * Đọc tất cả DSP deliveries của release → tổng hợp → cập nhật Release status.
	 * @param submitStatus - nếu submit đang WAITING_ACTION → release = AWAITING_ACTION
	 */
	async deriveAndUpdateReleaseStatus(
		releaseId: string,
		submitStatus?: ReleaseSubmitStatus,
	): Promise<ReleaseStatus> {
		const deliveries = await this.manager.find(ReleaseDspDelivery, {
			where: {
				releaseId,
				status: Not(ReleaseDspStatus.NEVER_DISTRIBUTED),
			},
		});

		if (deliveries.length === 0) {
			const status = ReleaseStatus.PROCESSING;
			await this.manager.update(Release, releaseId, { status });
			return status;
		}

		const statuses = deliveries.map((d) => d.status);
		const allDistributed = statuses.every(
			(s) => s === ReleaseDspStatus.DISTRIBUTED,
		);
		const allIssues = statuses.every((s) => s === ReleaseDspStatus.ISSUES);
		const hasProcessing = statuses.some(
			(s) => s === ReleaseDspStatus.PROCESSING,
		);

		let releaseStatus: ReleaseStatus;

		if (allDistributed) {
			releaseStatus = ReleaseStatus.DISTRIBUTED;
		} else if (allIssues) {
			releaseStatus = ReleaseStatus.FAILED;
		} else if (
			hasProcessing &&
			submitStatus === ReleaseSubmitStatus.WAITING_ACTION
		) {
			releaseStatus = ReleaseStatus.AWAITING_ACTION;
		} else if (hasProcessing) {
			releaseStatus = ReleaseStatus.PROCESSING;
		} else {
			// Mix distributed + issues (không còn processing)
			releaseStatus = ReleaseStatus.PARTIAL_DONE;
		}

		await this.manager.update(Release, releaseId, {
			status: releaseStatus,
		});

		return releaseStatus;
	}

	/**
	 * Chạy 1 step (parent hoặc child).
	 * - Nếu có children → chạy tuần tự children (recursive).
	 * - Nếu không có children → dispatch logic trực tiếp.
	 * Return true = thành công hoặc WAITING, false = failed.
	 */
	private async runStep(step: ReleaseSubmitStep): Promise<boolean> {
		await this.stepRepo.update(step.id, {
			status: SubmitStepStatus.PROCESSING,
			startedAt: new Date(),
		});

		try {
			const children = (step.childSteps || []).sort(
				(a, b) => a.order - b.order,
			);

			if (children.length > 0) {
				for (const child of children) {
					if (child.status === SubmitStepStatus.DONE) continue;
					if (child.status === SubmitStepStatus.SKIPPED) continue;

					// Child đã FAILED → parent fail, không chạy tiếp
					if (child.status === SubmitStepStatus.FAILED) {
						await this.stepRepo.update(step.id, {
							status: SubmitStepStatus.FAILED,
							completedAt: new Date(),
						});
						return false;
					}

					const childSuccess = await this.runStep(child);
					if (!childSuccess) {
						await this.skipRemainingChildSteps(
							step.id,
							child.order,
						);
						await this.stepRepo.update(step.id, {
							status: SubmitStepStatus.FAILED,
							completedAt: new Date(),
						});
						return false;
					}

					// Check WAITING_ACTION
					const childDb = await this.stepRepo.findOne({
						where: { id: child.id },
					});
					if (childDb?.status === SubmitStepStatus.WAITING_ACTION) {
						await this.stepRepo.update(step.id, {
							status: SubmitStepStatus.WAITING_ACTION,
						});
						return true;
					}
				}
			} else {
				await this.dispatchStepLogic(step);
			}

			// Check nếu dispatch set WAITING_ACTION
			const stepDb = await this.stepRepo.findOne({
				where: { id: step.id },
			});
			if (stepDb?.status === SubmitStepStatus.WAITING_ACTION) {
				return true;
			}

			// Done
			await this.stepRepo.update(step.id, {
				status: SubmitStepStatus.DONE,
				completedAt: new Date(),
			});
			this.logService.success({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Step ${step.type} completed`,
			});
			return true;
		} catch (err) {
			await this.stepRepo.update(step.id, {
				status: SubmitStepStatus.FAILED,
				completedAt: new Date(),
			});
			this.logService.error({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Step ${step.type} failed: ${err.message}`,
				data: { stack: err.stack },
			});
			return false;
		}
	}

	/**
	 * Skip children còn lại sau order chỉ định.
	 */
	private async skipRemainingChildSteps(
		parentStepId: string,
		afterOrder: number,
	) {
		await this.stepRepo
			.createQueryBuilder()
			.update()
			.set({ status: SubmitStepStatus.SKIPPED })
			.where('parent_step_id = :parentStepId', { parentStepId })
			.andWhere('order > :afterOrder', { afterOrder })
			.andWhere('status = :status', { status: SubmitStepStatus.NEW })
			.execute();
	}

	/**
	 * Dispatch logic cho từng step type. TODO: implement per-type logic.
	 */
	private async dispatchStepLogic(step: ReleaseSubmitStep): Promise<void> {
		const { releaseId, submit: submitDb } = await this.getStepContext(step);

		switch (step.type) {
			case SubmitStepType.GEN_UPC: {
				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[GEN_UPC] Release: ${releaseId}`,
				});
				const upc = await this.releaseService.genUpcById(releaseId);
				await this.stepRepo.update(step.id, {
					metadata: {
						input: { releaseId },
						output: { upc },
					} as any,
				});
				break;
			}

			case SubmitStepType.GEN_ISRCS: {
				// Handled by children (GEN_ISRC per track)
				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[GEN_ISRCS] handled by children`,
				});
				break;
			}

			case SubmitStepType.GEN_ISRC: {
				const trackId = step.metadata?.input?.trackId;
				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[GEN_ISRC] Track: ${trackId}`,
				});
				const isrc = await this.trackService.genISRC(trackId);
				await this.stepRepo.update(step.id, {
					metadata: {
						input: { trackId },
						output: { isrc },
					} as any,
				});
				break;
			}

			case SubmitStepType.VALIDATE: {
				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[VALIDATE] Release: ${releaseId}`,
				});
				const errors =
					this.releaseValidateService.getErrorsSchemaRelease(
						submitDb.metadata.input.releaseSnapshot,
					);

				await this.stepRepo.update(step.id, {
					metadata: {
						input: {
							releaseId,
						},
						output: {
							valid: errors.length === 0,
							errors: errors,
						},
					} as any,
				});

				if (errors.length > 0) {
					throw new Error(
						`Validation failed: ${errors.map((e: any) => e.message).join(', ')}`,
					);
				}
				break;
			}

			// ============================
			// Direct DSP sub-steps
			// ============================

			case SubmitStepType.CREATE_AND_UPLOAD_DIRECT: {
				const parent = await this.getParentStep(step);
				const dspCode = parent?.metadata?.input?.dsps?.[0]?.code;
				if (!dspCode)
					throw new Error('Missing DSP code from parent step');

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						dspCode,
					);

				// Create metadata
				const { outputDir, batchId, xml } =
					await this.releaseDdexService.createMetadataOnServer({
						release: submitDb.metadata.input.releaseSnapshot,
						ernVersion: config.ernVersion as unknown as ErnVersion2,
						sender: config.sender,
						recipient: config.recipient,
					});

				this.logService.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[CREATE_AND_UPLOAD_DIRECT] Metadata created for DSP: ${dspCode}`,
					data: { outputDir, batchId },
				});

				// Upload SFTP
				await this.sftpConnectService.uploadFolder({
					sftp: config.sftp,
					localDir: outputDir,
					remoteDir: config.sftp.path ?? '/',
				});

				// Cleanup local
				await removeFolder(outputDir);

				// Save metadata for downstream steps
				await this.stepRepo.update(step.id, {
					metadata: {
						input: { ernVersion: config.ernVersion, dspCode },
						output: { outputDir, batchId, xml },
					} as any,
				});

				this.logService.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[CREATE_AND_UPLOAD_DIRECT] DSP: ${dspCode} uploaded`,
				});
				break;
			}

			case SubmitStepType.SYNC_DATA_FROM_DSP: {
				const parent = await this.getParentStep(step);
				const dsp = parent?.metadata?.input?.dsps?.[0];
				if (!dsp) throw new Error('Missing dsp from parent step');

				// Upsert release_dsp_delivery
				const existed = await this.manager.findOne(ReleaseDspDelivery, {
					where: { releaseId, dspId: dsp.id },
				});

				const deliveryData = {
					status: ReleaseDspStatus.DISTRIBUTED,
					lastDeliveredAt: new Date(),
					isSelected: true,
				};

				if (!existed) {
					await this.manager.save(ReleaseDspDelivery, {
						releaseId,
						dspId: dsp.id,
						...deliveryData,
					});
				} else {
					await this.manager.update(
						ReleaseDspDelivery,
						{ releaseId, dspId: dsp.id },
						deliveryData,
					);
				}

				this.logService.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[SYNC_DATA_FROM_DSP] DSP: ${dsp.name} synced`,
				});
				break;
			}

			// ============================
			// CI Aggregator sub-steps
			// ============================

			// case SubmitStepType.CREATE_AND_UPLOAD_CI: {
			// 	// Tìm 1 DSP CI bất kỳ để lấy config
			// 	const parent = await this.getParentStep(step);
			// 	const ciDsps = parent?.metadata?.input?.dsps || [];
			// 	if (ciDsps.length === 0) throw new Error('No CI DSPs found');

			// 	const ciDsp = await this.manager.findOne(Dsp, {
			// 		where: { id: ciDsps[0].id },
			// 		relations: [
			// 			'dspRoutingConfig',
			// 			'dspRoutingConfig.aggregator',
			// 		],
			// 	});
			// 	if (!ciDsp?.code) throw new Error('CI DSP not found');

			// 	const config =
			// 		await this.dspRoutingService.resolveFullDeliveryConfig(
			// 			ciDsp.code,
			// 		);

			// 	// Create metadata
			// 	const { outputDir, batchId, xml } =
			// 		await this.releaseDdexService.createMetadataOnServer({
			// 			release: submitDb.metadata.input.releaseSnapshot,
			// 			ernVersion: config.ernVersion as unknown as ErnVersion2,
			// 			sender: config.sender,
			// 			recipient: config.recipient,
			// 		});

			// 	this.logService.success({
			// 		releaseSubmitId: step.releaseSubmitId,
			// 		releaseSubmitStepId: step.id,
			// 		message: `[CREATE_AND_UPLOAD_CI] Metadata created`,
			// 		data: { outputDir, batchId },
			// 	});

			// 	// Upload SFTP
			// 	await this.sftpConnectService.uploadFolder({
			// 		sftp: config.sftp,
			// 		localDir: outputDir,
			// 		remoteDir: config.sftp.path ?? '/',
			// 	});

			// 	await removeFolder(outputDir);

			// 	// Save metadata for downstream steps (CREATE_FOLDER_DONE_CI, etc.)
			// 	await this.stepRepo.update(step.id, {
			// 		metadata: {
			// 			input: {
			// 				ernVersion: config.ernVersion,
			// 				dspCode: ciDsp.code,
			// 			},
			// 			output: { outputDir, batchId, xml },
			// 		} as any,
			// 	});

			// 	this.logService.success({
			// 		releaseSubmitId: step.releaseSubmitId,
			// 		releaseSubmitStepId: step.id,
			// 		message: `[CREATE_AND_UPLOAD_CI] uploaded`,
			// 	});
			// 	break;
			// }

			case SubmitStepType.CREATE_AND_UPLOAD_CI: {
				// Tìm DSP CI có config hợp lệ
				const parent = await this.getParentStep(step);
				const ciDsps = parent?.metadata?.input?.dsps || [];
				if (ciDsps.length === 0) throw new Error('No CI DSPs found');

				let ciDsp: Dsp | null = null;
				let config: Awaited<
					ReturnType<
						typeof this.dspRoutingService.resolveFullDeliveryConfig
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
						// DSP này không có config, thử DSP tiếp theo
						continue;
					}
				}

				if (!ciDsp || !config)
					throw new Error('No CI DSP with valid config found');

				// Create metadata
				const { outputDir, batchId, xml } =
					await this.releaseDdexService.createMetadataOnServer({
						release: submitDb.metadata.input.releaseSnapshot,
						ernVersion: config.ernVersion as unknown as ErnVersion2,
						sender: config.sender,
						recipient: config.recipient,
					});

				this.logService.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[CREATE_AND_UPLOAD_CI] Metadata created`,
					data: { outputDir, batchId },
				});

				// Upload SFTP
				await this.sftpConnectService.uploadFolder({
					sftp: config.sftp,
					localDir: outputDir,
					remoteDir: config.sftp.path ?? '/',
				});

				await removeFolder(outputDir);

				// Save metadata for downstream steps (CREATE_FOLDER_DONE_CI, etc.)
				await this.stepRepo.update(step.id, {
					metadata: {
						input: {
							ernVersion: config.ernVersion,
							dspCode: ciDsp.code,
						},
						output: { outputDir, batchId, xml },
					} as any,
				});

				this.logService.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[CREATE_AND_UPLOAD_CI] uploaded`,
				});
				break;
			}

			case SubmitStepType.CREATE_FOLDER_DONE_CI: {
				// Lấy batchId từ sibling CREATE_AND_UPLOAD_CI
				const metaStep = await this.getSiblingStepByType(
					step,
					SubmitStepType.CREATE_AND_UPLOAD_CI,
				);
				const batchId = metaStep?.metadata?.output?.batchId;
				if (!batchId) {
					throw new Error(
						'Missing batchId from CREATE_AND_UPLOAD_CI step',
					);
				}

				// Lấy dspCode CI từ sibling CREATE_AND_UPLOAD_CI
				const dspCode = metaStep?.metadata?.input?.dspCode;
				if (!dspCode) {
					throw new Error(
						'Missing dspCode from CREATE_AND_UPLOAD_CI step',
					);
				}

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						dspCode,
					);

				const client = await this.sftpConnectService.connect(
					config.sftp,
				);
				try {
					const donePath = path.posix.join(
						config.sftp.path ?? '/',
						`${batchId}.done`,
					);
					await client.mkdir(donePath, true);
					this.logService.success({
						releaseSubmitId: step.releaseSubmitId,
						releaseSubmitStepId: step.id,
						message: `[CREATE_FOLDER_DONE_CI] Created: ${donePath}`,
						data: { batchId, donePath },
					});
				} finally {
					await client.end();
				}
				break;
			}

			case SubmitStepType.WAIT_PARTNER_PROCESS: {
				const waitMinutes = step.metadata?.input?.waitMinutes ?? 3;
				const scheduledAt = new Date(
					Date.now() + waitMinutes * 60 * 1000,
				);

				await this.stepRepo.update(step.id, {
					status: SubmitStepStatus.WAITING_ACTION,
					scheduledAt,
				});

				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[WAIT_PARTNER_PROCESS] Scheduled resume at ${scheduledAt.toISOString()} (+${waitMinutes}min)`,
				});
				break;
			}

			case SubmitStepType.VALIDATE_QA_CI: {
				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[VALIDATE_QA_CI] Release: ${releaseId}`,
				});
				const qaFlags =
					await this.releaseService.getQaFlagCi(releaseId);
				const hasIssues = Array.isArray(qaFlags) && qaFlags.length > 0;

				await this.stepRepo.update(step.id, {
					metadata: {
						input: { releaseId },
						output: { qaFlags, hasIssues },
					} as any,
				});

				if (hasIssues) {
					throw new Error(
						`QA validation failed: ${qaFlags.length} issue(s) found`,
					);
				}
				break;
			}

			case SubmitStepType.EXPORT_CI: {
				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[EXPORT_CI] Release: ${releaseId}`,
				});

				const exportInput = step.metadata?.input || {};
				const upc = submitDb.metadata?.input?.releaseSnapshot?.upc;

				// Tạo job email_state51 (nếu có state51 DSPs)
				const state51DspCodes: string[] =
					exportInput.state51DspCodes || [];
				const state51DspsData: any[] = exportInput.state51Dsps || [];
				if (state51DspCodes.length > 0) {
					// Lấy deliveryEmail từ aggregator
					const ciDsp =
						state51DspsData.length > 0
							? await this.manager.findOne(Dsp, {
									where: { id: state51DspsData[0].id },
									relations: [
										'dspRoutingConfig',
										'dspRoutingConfig.aggregator',
									],
								})
							: null;
					const deliveryEmail =
						ciDsp?.dspRoutingConfig?.aggregator?.deliveryEmail;
					const deliveryEmailSubject =
						ciDsp?.dspRoutingConfig?.aggregator
							?.deliveryEmailSubject;

					if (!deliveryEmail) {
						throw new Error(
							'[EXPORT_CI] Missing deliveryEmail on aggregator for state51 DSPs',
						);
					}

					await this.ciJobService.createJob({
						type: CiJobType.EMAIL_STATE51,
						upc,
						dspCiCodes: state51DspCodes,
						releaseSubmitId: step.releaseSubmitId,
						stepId: step.id,
						releaseId,
						deliveryEmail,
						deliveryEmailSubject,
						stepLabel: 'Export CI - Email State51',
					});
				}

				// Tạo job admin_export (nếu có deal DSPs)
				const ciDealDspCodes: string[] =
					exportInput.ciDealDspCodes || [];
				if (ciDealDspCodes.length > 0) {
					await this.ciJobService.createJob({
						type: CiJobType.ADMIN_EXPORT,
						upc,
						dspCiCodes: ciDealDspCodes,
						releaseSubmitId: step.releaseSubmitId,
						stepId: step.id,
						releaseId,
						stepLabel: 'Export CI - Admin Export',
					});
				}

				// WAITING_ACTION — chờ tất cả CI jobs xong mới resume
				await this.stepRepo.update(step.id, {
					status: SubmitStepStatus.WAITING_ACTION,
				});

				this.logService.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[EXPORT_CI] ${state51DspCodes.length > 0 ? 'email_state51' : ''} ${ciDealDspCodes.length > 0 ? 'admin_export' : ''} jobs created, step paused`,
					data: { upc, state51DspCodes, ciDealDspCodes },
				});
				break;
			}

			case SubmitStepType.SYNC_DATA_DSP_CI: {
				const upc = submitDb.metadata?.input?.releaseSnapshot?.upc;
				if (!upc) throw new Error('Missing UPC from release snapshot');

				this.logService.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[SYNC_DATA_DSP_CI] Fetching DSP statuses from CI for UPC: ${upc}`,
				});

				const dspStatuses = await this.ciService.getStatusDsps(upc);

				// Map CI code → system code
				const ciCodes = dspStatuses
					.map((d) => d.ciCode)
					.filter(Boolean);
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

				// Lưu kết quả vào metadata.output
				await this.stepRepo.update(step.id, {
					metadata: {
						...step.metadata,
						output: {
							...step.metadata?.output,
							result: mappedStatuses,
						},
					} as any,
				});

				this.logService.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[SYNC_DATA_DSP_CI] ${mappedStatuses.length} DSPs synced`,
					data: { dspStatuses: mappedStatuses },
				});
				break;
			}

			default:
				throw new Error(`Unknown step type1: ${step.type}`);
		}
	}

	private async skipRemainingSteps(submitId: string, afterOrder: number) {
		await this.stepRepo
			.createQueryBuilder()
			.update()
			.set({ status: SubmitStepStatus.SKIPPED })
			.where('release_submit_id = :submitId', { submitId })
			.andWhere('parent_step_id IS NULL')
			.andWhere('order > :afterOrder', { afterOrder })
			.andWhere('status = :status', { status: SubmitStepStatus.NEW })
			.execute();
	}

	// 	// ==========================================
	// CRON — Auto-resume scheduled steps
	// ==========================================

	@Cron(CronExpression.EVERY_MINUTE)
	async handleScheduledSteps() {
		const now = new Date();

		const readySteps = await this.stepRepo.find({
			where: {
				status: SubmitStepStatus.WAITING_ACTION,
				scheduledAt: LessThanOrEqual(now),
			},
		});

		for (const step of readySteps) {
			this.logService.log({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `[CRON] Auto-resuming scheduled step ${step.type}`,
			});

			this.resumeFromWaiting({ stepId: step.id }).catch((err) => {
				this.logService.error({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[CRON] Auto-resume failed: ${err.message}`,
				});
			});
		}
	}

	async resumeFromWaiting({
		stepId,
		outputMetadataStep,
	}: {
		stepId: string;
		outputMetadataStep?: Record<string, any>;
	}) {
		const step = await this.stepRepo.findOne({ where: { id: stepId } });
		if (!step) throw new NotFoundException('Step not found');
		if (step.status !== SubmitStepStatus.WAITING_ACTION) {
			throw new Error('Step is not in WAITING_ACTION status');
		}

		// Merge output vào metadata mà không mất data cũ
		// const updatedMetadata = {
		// 	...step.metadata,
		// 	...(outputMetadataStep ? { output: { ...step.metadata?.output, ...outputMetadataStep } } : {}),
		// };

		// Mark step as DONE
		await this.stepRepo.update(stepId, {
			status: SubmitStepStatus.DONE,
			completedAt: new Date(),
			// metadata: updatedMetadata,
		});

		// Resume execution
		await this.submitRepo.update(step.releaseSubmitId, {
			status: ReleaseSubmitStatus.PROCESSING,
		});

		// runPipeline → resolveSubmitStatus → deriveAndUpdateReleaseStatus sẽ tự sync
		this.runPipeline(step.releaseSubmitId).catch((err) => {
			this.logService.error({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Resume re-execute failed: ${err.message}`,
			});
		});

		return { message: 'Resumed' };
	}

	async retryStep(stepId: string) {
		const step = await this.stepRepo.findOne({
			where: { id: stepId },
		});

		if (!step) throw new NotFoundException('Step not found');

		// Reset step về NEW
		await this.stepRepo.update(stepId, {
			status: SubmitStepStatus.NEW,
			startedAt: null,
			completedAt: null,
			retryCount: step.retryCount + 1,
		});

		// Nếu retry child step → cũng phải reset parent step để runPipeline chạy lại parent
		if (step.parentStepId) {
			await this.stepRepo.update(step.parentStepId, {
				status: SubmitStepStatus.NEW,
				startedAt: null,
				completedAt: null,
			});
		}

		// Reset parent submit về PROCESSING
		await this.submitRepo.update(step.releaseSubmitId, {
			status: ReleaseSubmitStatus.PROCESSING,
			completedAt: null,
			summary: null,
		});

		// Reset các step sau (nếu bị SKIPPED) về NEW
		const siblingSteps = await this.stepRepo.find({
			where: {
				releaseSubmitId: step.releaseSubmitId,
				parentStepId: step.parentStepId ?? IsNull(),
			},
			order: { order: 'ASC' },
		});

		for (const s of siblingSteps) {
			if (s.order > step.order && s.status === SubmitStepStatus.SKIPPED) {
				await this.stepRepo.update(s.id, {
					status: SubmitStepStatus.NEW,
				});
			}
		}

		// Re-execute
		this.runPipeline(step.releaseSubmitId).catch((err) => {
			this.logService.error({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Retry re-execute failed: ${err.message}`,
			});
		});

		return { message: 'Retry started' };
	}

	// 	/**
	// 	 * Tính submit status từ trạng thái các distribution branches.
	// 	 * - Tất cả DONE → DONE
	// 	 * - Có WAITING_ACTION → WAITING_ACTION
	// 	 * - Mix DONE + FAILED → PARTIAL_DONE
	// 	 * - Tất cả FAILED → FAILED
	// 	 *
	// 	 * Đồng thời sync kết quả vào ReleaseDspDelivery:
	// 	 * - Branch FAILED → DSPs của branch đó → ISSUES
	// 	 * - Ghi tổng kết vào metadata.output.results
	// 	 */
	private async resolveSubmitStatus(submitId: string) {
		const submit = await this.submitRepo.findOne({
			where: { id: submitId },
		});
		if (!submit) return;

		const distSteps = await this.stepRepo.find({
			where: {
				releaseSubmitId: submitId,
				parentStepId: IsNull(),
			},
		});

		const distBranches = distSteps.filter((s) =>
			this.DISTRIBUTION_TYPES.includes(s.type),
		);

		// Nếu không có distribution branches (chỉ có critical steps) → DONE
		if (distBranches.length === 0) {
			await this.submitRepo.update(submitId, {
				status: ReleaseSubmitStatus.DONE,
				completedAt: new Date(),
			});
			this.logService.success({
				releaseSubmitId: submitId,
				message: 'All steps completed (no distribution branches)',
			});
			return;
		}

		const statuses = distBranches.map((s) => s.status);
		const hasWaiting = statuses.includes(SubmitStepStatus.WAITING_ACTION);
		const hasProcessing =
			statuses.includes(SubmitStepStatus.PROCESSING) ||
			statuses.includes(SubmitStepStatus.NEW);
		const hasFailed = statuses.includes(SubmitStepStatus.FAILED);
		const allDone = statuses.every((s) => s === SubmitStepStatus.DONE);
		const allFailed = statuses.every((s) => s === SubmitStepStatus.FAILED);

		let finalStatus: ReleaseSubmitStatus;
		if (hasWaiting) {
			finalStatus = ReleaseSubmitStatus.WAITING_ACTION;
		} else if (hasProcessing) {
			finalStatus = ReleaseSubmitStatus.PROCESSING;
		} else if (allDone) {
			finalStatus = ReleaseSubmitStatus.DONE;
		} else if (allFailed) {
			finalStatus = ReleaseSubmitStatus.FAILED;
		} else {
			finalStatus = ReleaseSubmitStatus.PARTIAL_DONE;
		}

		// Sync kết quả vào ReleaseDspDelivery + thu thập result
		const result: ReleaseSubmitResultDto[] = [];

		for (const branch of distBranches) {
			const dsps: Dsp[] = branch.metadata?.input?.dsps || [];
			const branchDone = branch.status === SubmitStepStatus.DONE;
			const branchFailed = branch.status === SubmitStepStatus.FAILED;

			// Lấy QA flags từ VALIDATE_QA_CI child step (nếu có)
			let qaFlags: any = null;
			if (branchFailed) {
				const qaStep = await this.stepRepo.findOne({
					where: {
						parentStepId: branch.id,
						type: SubmitStepType.VALIDATE_QA_CI,
					},
				});
				qaFlags = qaStep?.metadata?.output?.qaFlags || null;
			}

			// CI branch: lấy trạng thái thực từ SYNC_DATA_DSP_CI step
			if (branch.type === SubmitStepType.PROCESS_AGG_CI && branchDone) {
				const syncStep = await this.stepRepo.findOne({
					where: {
						parentStepId: branch.id,
						type: SubmitStepType.SYNC_DATA_DSP_CI,
					},
				});
				const ciResult = syncStep?.metadata?.output?.result || [];

				for (const r of ciResult) {
					const dspCode = r.code || r.ciCode;
					const dsp = dsps.find((d) => d.code === dspCode);

					if (dsp) {
						if (r.status === 'transfer failed') {
							await this.manager.update(
								ReleaseDspDelivery,
								{ releaseId: submit.releaseId, dspId: dsp.id },
								{ status: ReleaseDspStatus.ISSUES },
							);
						} else {
							await this.manager.update(
								ReleaseDspDelivery,
								{ releaseId: submit.releaseId, dspId: dsp.id },
								{
									status: ReleaseDspStatus.DISTRIBUTED,
									lastDeliveredAt: new Date(),
								},
							);
						}
					}

					result.push({ dspCode, status: r.status });
				}
				continue;
			}

			for (const dsp of dsps) {
				if (branchFailed) {
					await this.manager.update(
						ReleaseDspDelivery,
						{ releaseId: submit.releaseId, dspId: dsp.id },
						{
							status: ReleaseDspStatus.ISSUES,
							issues: qaFlags,
						},
					);
				}

				result.push({
					dspCode: dsp.code,
					status: branchDone
						? 'success'
						: branchFailed
							? 'failed'
							: 'processing',
				});
			}
		}

		// Ghi result vào metadata.output
		const updatedMetadata = {
			...submit.metadata,
			output: { result },
		};

		await this.submitRepo.update(submitId, {
			status: finalStatus,
			completedAt: hasWaiting ? null : new Date(),
			metadata: updatedMetadata,
		});

		// Derive release status từ DSP deliveries
		await this.deriveAndUpdateReleaseStatus(submit.releaseId, finalStatus);

		// this.log.log({
		// 	releaseSubmitId: submitId,
		// 	message: `Submit resolved: ${finalStatus}`,
		// 	data: {
		// 		branchStatuses: distBranches.map((s) => ({
		// 			type: s.type,
		// 			status: s.status,
		// 		})),
		// 		result,
		// 	},
		// });
	}

	// query
	private async getStepContext(step: ReleaseSubmitStep) {
		const submit = await this.submitRepo.findOne({
			where: { id: step.releaseSubmitId },
		});
		if (!submit)
			throw new Error(`Submit ${step.releaseSubmitId} not found`);
		return {
			releaseId: submit.releaseId,
			submit,
		};
	}

	private async getParentStep(step: ReleaseSubmitStep) {
		if (!step.parentStepId) return null;
		return this.stepRepo.findOne({
			where: { id: step.parentStepId },
		});
	}

	async findOne(id: string) {
		const entity = await this.submitRepo.findOne({
			where: { id },
			relations: {
				steps: {
					childSteps: {
						logs: true,
					},
					logs: true,
				},
				logs: true,
			},
		});
		if (!entity) {
			throw new NotFoundException('Release submit not found');
		}
		return entity;
	}

	private async getSiblingStepByType(
		step: ReleaseSubmitStep,
		type: SubmitStepType,
	) {
		return this.stepRepo.findOne({
			where: {
				parentStepId: step.parentStepId ?? IsNull(),
				releaseSubmitId: step.releaseSubmitId,
				type,
			},
		});
	}

	async getList(query: QueryGetListSubmitDto) {
		const { keyword, page, pageSize, status, releaseId, type } = query;

		const qb = this.submitRepo.createQueryBuilder('submit');
		// .leftJoinAndSelect('submit.steps', 'steps', 'steps.parent_step_id IS NULL');

		if (keyword?.length) {
			const keywords = keyword.map((k) => `%${k}%`);

			qb.andWhere(
				`(
					submit.release_title ILIKE ANY(:keywords)
					OR submit.release_upc ILIKE ANY(:keywords)
				)`,
				{ keywords },
			);
		}

		// Filter status
		if (status?.length) {
			qb.andWhere('submit.status IN (:...status)', { status });
		}

		// Filter type
		if (type?.length) {
			qb.andWhere('submit.type IN (:...type)', { type });
		}

		// Filter releaseId
		if (releaseId) {
			qb.andWhere('submit.releaseId = :releaseId', { releaseId });
		}

		// Order + Pagination
		orderAndPaging2({ qb, filter: query });

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}
}
