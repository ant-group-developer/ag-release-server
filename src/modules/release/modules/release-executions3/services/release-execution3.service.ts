import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { QueryGetListReleaseDto } from 'src/modules/release/dto/release.dto';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import {
	ReleaseReview,
	ReleaseReviewStatus,
} from 'src/modules/release/modules/release-reviews/entities/release-review.entity';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { EntityManager, In, Repository } from 'typeorm';
import {
	QueryGetListReleaseExecution3Dto,
	ReleaseExecutionPageDto,
} from '../dtos/release-execution3.dto';
import { CiDistributionJob3 } from '../entites/ci-distribution-job3.entity';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	CiJobStatus3,
	ExecutionType,
	ReleaseExecutionStatus,
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { ReleaseExecution3Queue } from './queue/release-execution3.queue';
import { ReleaseExecution3ResultService } from './release-execution3-result.service';
import { ReleaseExecution3Builder } from './release-execution3.builder';
import { ReleaseExecutionStepEngine } from './release-execution3.engine';
import { ReleaseExecution3QueryService } from './release-execution3.query.service';

@Injectable()
export class ReleaseExecution3Service {
	constructor(
		@InjectEntityManager()
		private readonly manager: EntityManager,

		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,

		@InjectRepository(ReleaseExecutionStep3)
		private readonly step3Repo: Repository<ReleaseExecutionStep3>,

		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,
		private readonly dspRoutingService: DspRoutingConfigsService,

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,

		private readonly queueService: ReleaseExecution3Queue,

		private readonly builder: ReleaseExecution3Builder,
		private readonly engine: ReleaseExecutionStepEngine,
		private readonly queryService: ReleaseExecution3QueryService,
		private readonly releaseExecution3ResultService: ReleaseExecution3ResultService,
	) {}

	// đẩy vào queue, consumer tự quét và xử lí
	async newReleaseExecution(body: {
		release: Release;
		dspCodes: string[];
		type: ExecutionType;
	}) {
		return await this.queueService.queueExecution(body);
		// await this.startProcessing();
	}

	async resumeWaitingSteps(): Promise<void> {
		const now = new Date();

		const waitingSteps = await this.queryService.getListWaitingSteps(now);

		// Group theo executionId, chỉ resume 1 lần mỗi execution
		const executionIds = [
			...new Set(waitingSteps.map((step) => step.releaseExecutionId)),
		];

		console.log(
			`[ReleaseExecution3Service] Found ${waitingSteps.length} waiting steps, ${executionIds.length} executions to resume`,
		); // log thêm

		for (const executionId of executionIds) {
			await this.queueService.queueRunPipeline(executionId);
			// await this.runPipeline('');
		}
	}

	// main
	async startProcessing(id: string): Promise<void> {
		const execution = await this.queryService.findOne(id);

		if (execution.status !== ReleaseExecutionStatus.NEW) {
			throw new Error('Only execution with NEW status can be started');
		}

		// cancel job cũ nếu trùng ít nhất 1 dsp
		await this.cancelPendingExecutions({
			releaseId: execution.metadata.input.releaseSnapshot.id,
			excludeExecutionId: id,
			dspCodes: execution.metadata.input.dspCodes,
		});

		execution.status = ReleaseExecutionStatus.PROCESSING;
		await this.executionRepo.save(execution);

		// parse execution.metadata
		await this.parseMetadata(execution);

		// build tree
		await this.builder.buildStepsChild({ releaseExecution: execution });

		// enqueue pipeline execution vì nó nặng
		await this.queueService.queueRunPipeline(id);
	}

	async runPipeline(id: string): Promise<void> {
		const execution = await this.queryService.findOne(id);
		const steps = execution.steps || [];

		try {
			for (const step of steps) {
				const statusStep = await this.engine.processStep({
					step,
					releaseExecution: execution,
				});

				if (this.shouldStopSequential(statusStep)) {
					await this.updateExecutionStatus({
						execution,
						status: this.mapStepStatusToExecutionStatus(statusStep),
					});
					return;
				}
			}

			await this.refreshExecutionStatus(execution);
		} finally {
			// Luôn sync output kể cả khi pipeline return sớm hoặc phát sinh lỗi.
			await this.engine.syncExecutionOutputToReleaseDeliveryDsp(
				execution,
			);
		}
	}

	async syncExecutionOutputToReleaseDeliveryDsp(id: string) {
		await this.engine.syncExecutionOutputToReleaseDeliveryDsp({ id });
	}

	private async parseMetadata(execution: ReleaseExecution3): Promise<void> {
		const { dspCodes, releaseSnapshot } = execution.metadata.input;

		if (!dspCodes?.length) {
			return;
		}

		const dsps = await this.manager.find(Dsp, {
			where: { code: In(dspCodes) },
			relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
		});

		const directDsps: Dsp[] = [];
		const ciDealDsps: Dsp[] = [];
		const state51Dsps: Dsp[] = [];

		for (const dsp of dsps) {
			const config = dsp.dspRoutingConfig;

			const isCI =
				config?.mode === RoutingModeEnum.AGGREGATOR &&
				config.aggregator?.code === 'CI';

			if (!isCI) {
				directDsps.push(dsp);
				continue;
			}

			if (dsp.hasDeal) {
				ciDealDsps.push(dsp);
			} else {
				state51Dsps.push(dsp);
			}
		}

		execution.metadata.input.dspDirect = directDsps;
		const isSkipImport =
			execution.type === ExecutionType.TAKEDOWN ||
			ciDealDsps.length === 0 ||
			releaseSnapshot.ciData?.needImportAgain === false;

		execution.metadata.input.dspAggregator = {
			ci: {
				ci: ciDealDsps,
				state51: state51Dsps,
				primaryDsp: null,
				isSkipImport,
			},
		};

		const ciDsps = [...ciDealDsps, ...state51Dsps];
		const allDeliveryDsps = [...directDsps, ...ciDsps];

		execution.metadata.input.delivery = {
			all: this.buildDeliveryMetadataInput(
				execution.metadata.input.releaseSnapshot.id,
				allDeliveryDsps,
			),
			directByDspId: Object.fromEntries(
				directDsps.map((dsp) => [
					dsp.id,
					this.buildDeliveryMetadataInput(
						execution.metadata.input.releaseSnapshot.id,
						[dsp],
					),
				]),
			),
			aggCi: this.buildDeliveryMetadataInput(
				execution.metadata.input.releaseSnapshot.id,
				ciDsps,
			),
		};

		for (const dsp of ciDealDsps) {
			if (!dsp.code) {
				continue;
			}

			try {
				await this.dspRoutingService.resolveFullDeliveryConfig(
					dsp.code,
				);

				execution.metadata.input.dspAggregator.ci.primaryDsp = dsp;
				break;
			} catch {
				continue;
			}
		}

		await this.executionRepo.save(execution);

		const initialDspStatus =
			execution.type === ExecutionType.TAKEDOWN
				? ReleaseDspStatus.PROCESSING
				: ReleaseDspStatus.NEVER_DISTRIBUTED;

		await this.releaseExecution3ResultService.updateExecutionOutputResult({
			releaseExecutionId: execution.id,
			releaseId: execution.metadata.input.releaseSnapshot.id,
			results: allDeliveryDsps.map((dsp) => ({
				dspId: dsp.id,
				dspCode: dsp.code,
				status: initialDspStatus,
			})),
		});

		return;
	}

	private buildDeliveryMetadataInput(releaseId: string, dsps: Dsp[]) {
		return {
			releaseId,
			items: dsps
				.filter((dsp) => !!dsp.id)
				.map((dsp) => ({
					dspId: dsp.id,
					dspCode: dsp.code,
				})),
		};
	}

	private shouldStopSequential(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.CANCELLED,
			ReleaseExecutionStepStatus.WAITING_ACTION,
			ReleaseExecutionStepStatus.WAITING_PARTNER,
		].includes(status);
	}

	private mapStepStatusToExecutionStatus(
		status: ReleaseExecutionStepStatus,
	): ReleaseExecutionStatus {
		switch (status) {
			case ReleaseExecutionStepStatus.DONE:
				return ReleaseExecutionStatus.DONE;

			case ReleaseExecutionStepStatus.FAILED:
				return ReleaseExecutionStatus.FAILED;

			case ReleaseExecutionStepStatus.CANCELLED:
				return ReleaseExecutionStatus.CANCELLED;

			case ReleaseExecutionStepStatus.WAITING_ACTION:
				return ReleaseExecutionStatus.WAITING_ACTION;

			case ReleaseExecutionStepStatus.WAITING_PARTNER:
				return ReleaseExecutionStatus.WAITING_PARTNER;

			default:
				return ReleaseExecutionStatus.PROCESSING;
		}
	}

	private async refreshExecutionStatus(
		execution: ReleaseExecution3,
	): Promise<ReleaseExecutionStatus> {
		// từ trạng thái của các step => status của exe
		const status = this.deriveExecutionStatusFromSteps(execution);

		await this.updateExecutionStatus({ execution, status });

		return status;
	}

	//
	private async updateExecutionStatus({
		execution,
		status,
		summary,
	}: {
		execution: ReleaseExecution3;
		status: ReleaseExecutionStatus;
		summary?: string;
	}): Promise<void> {
		execution.status = status;

		if (summary !== undefined) {
			execution.summary = summary;
		}

		if (this.isFinalExecutionStatus(status)) {
			execution.completedAt = new Date();
		}

		// Chỉ update các cột trạng thái; không dùng save(execution) vì snapshot
		// metadata cũ có thể ghi đè output.result vừa được các step cập nhật.
		await this.executionRepo.update(execution.id, {
			status: execution.status,
			completedAt: execution.completedAt,
			...(summary !== undefined && { summary: execution.summary }),
		});
		await this.syncDeliveryStatusByExecutionStatus(execution, status);
	}

	private async syncDeliveryStatusByExecutionStatus(
		execution: ReleaseExecution3,
		executionStatus: ReleaseExecutionStatus,
	): Promise<void> {
		const delivery = execution.metadata?.input?.delivery?.all;
		if (!delivery?.releaseId || !delivery.items?.length) return;

		const status = this.mapExecutionStatusToDeliveryStatus(executionStatus);

		await this.releaseExecution3ResultService.updateExecutionOutputResult({
			releaseExecutionId: execution.id,
			releaseId: delivery.releaseId,
			results: delivery.items.map((item) => ({
				...item,
				dspCode: item.dspCode,
				status,
			})),
		});
	}

	private mapExecutionStatusToDeliveryStatus(
		status: ReleaseExecutionStatus,
	): ReleaseDspStatus {
		if (status === ReleaseExecutionStatus.DONE) {
			return ReleaseDspStatus.DISTRIBUTED;
		}

		if (
			[
				ReleaseExecutionStatus.FAILED,
				ReleaseExecutionStatus.CANCELLED,
			].includes(status)
		) {
			return ReleaseDspStatus.ISSUES;
		}

		return ReleaseDspStatus.PROCESSING;
	}

	private isFinalExecutionStatus(status: ReleaseExecutionStatus): boolean {
		return [
			ReleaseExecutionStatus.DONE,
			ReleaseExecutionStatus.FAILED,
			ReleaseExecutionStatus.CANCELLED,
		].includes(status);
	}

	private deriveExecutionStatusFromSteps(
		execution: ReleaseExecution3,
	): ReleaseExecutionStatus {
		const steps = execution.steps || [];

		if (!steps.length) {
			return execution.status;
		}

		const statuses = steps.map((step) => step.status);

		if (statuses.includes(ReleaseExecutionStepStatus.WAITING_ACTION)) {
			return ReleaseExecutionStatus.WAITING_ACTION;
		}

		// if (statuses.includes(ReleaseExecutionStepStatus.WAITING_PARTNER)) {
		// 	return ReleaseExecutionStatus.WAITING_PARTNER;
		// }

		if (statuses.some((s) => s === ReleaseExecutionStepStatus.PROCESSING)) {
			return ReleaseExecutionStatus.PROCESSING;
		}

		if (statuses.some((s) => s === ReleaseExecutionStepStatus.NEW)) {
			return ReleaseExecutionStatus.PROCESSING;
		}

		if (statuses.every((s) => s === ReleaseExecutionStepStatus.DONE)) {
			return ReleaseExecutionStatus.DONE;
		}

		if (statuses.every((s) => s === ReleaseExecutionStepStatus.FAILED)) {
			return ReleaseExecutionStatus.FAILED;
		}

		if (statuses.every((s) => s === ReleaseExecutionStepStatus.CANCELLED)) {
			return ReleaseExecutionStatus.CANCELLED;
		}

		if (
			statuses.includes(ReleaseExecutionStepStatus.FAILED) &&
			statuses.includes(ReleaseExecutionStepStatus.CANCELLED)
		) {
			return ReleaseExecutionStatus.FAILED;
		}

		return ReleaseExecutionStatus.PROCESSING;
	}

	// query
	async getList(query: QueryGetListReleaseExecution3Dto) {
		query.releaseIds = await this.resolveReleaseExecutionReleaseIds(query);

		const [items, totalItems] = await this.getListItems(query);
		const statusCounts = await this.queryService.getStatusCounts(query);

		return new ReleaseExecutionPageDto({
			items,
			metadata: {
				...query,
				totalItems,
				statusCounts,
			},
		});
	}

	private async getListItems(
		query: QueryGetListReleaseExecution3Dto,
	): Promise<[ReleaseExecution3[], number]> {
		const qb = this.queryService.createQbGetList(query);

		orderAndPaging2({ qb, filter: query });

		return qb.getManyAndCount();
	}

	// gọi sang release service để lấy ra list release id
	private async resolveReleaseExecutionReleaseIds(
		query: QueryGetListReleaseExecution3Dto,
	): Promise<string[]> {
		const explicitReleaseIds = [...(query.releaseIds ?? [])].filter(
			Boolean,
		);
		const uniqueExplicitReleaseIds = [...new Set(explicitReleaseIds)];

		if (!query.queryListReleases) {
			return uniqueExplicitReleaseIds;
		}

		const releaseQuery = Object.assign(
			new QueryGetListReleaseDto(),
			query.queryListReleases,
			{
				page: 1,
				pageSize: 100000,
			},
		);

		const releases = await this.releaseService.getList(releaseQuery);
		const queriedReleaseIds = [
			...new Set(
				releases.items
					.map((release) => (release as { id?: string }).id)
					.filter((id): id is string => !!id),
			),
		];

		if (!uniqueExplicitReleaseIds.length) {
			return queriedReleaseIds ?? [];
		}

		return [
			...new Set([...uniqueExplicitReleaseIds, ...queriedReleaseIds]),
		];
	}

	async cancelPendingExecutions(input: {
		releaseId: string;
		excludeExecutionId?: string;
		dspCodes?: string[];
	}) {
		const pendingExecutions =
			await this.queryService.getPendingExecutions(input);

		if (pendingExecutions.length === 0) return;

		const executionIds = pendingExecutions.map((e) => e.id);

		// cacncel execution
		await this.executionRepo
			.createQueryBuilder()
			.update()
			.set({
				status: ReleaseExecutionStatus.CANCELLED,
				completedAt: new Date(),
			})
			.where('id IN (:...ids)', { ids: executionIds })
			.execute();

		// cancel step
		await this.step3Repo
			.createQueryBuilder()
			.update()
			.set({
				status: ReleaseExecutionStepStatus.CANCELLED,
				completedAt: new Date(),
			})
			.where('release_execution_id IN (:...ids)', { ids: executionIds })
			.andWhere('status IN (:...stepStatuses)', {
				stepStatuses: [
					ReleaseExecutionStepStatus.NEW,
					ReleaseExecutionStepStatus.PROCESSING,
					ReleaseExecutionStepStatus.WAITING_ACTION,
					ReleaseExecutionStepStatus.WAITING_PARTNER,
				],
			})
			.execute();

		// cancel ci job
		await this.manager
			.createQueryBuilder()
			.update(CiDistributionJob3)
			.set({
				status: CiJobStatus3.CANCEL,
				note: 'Job execution cha bị huỷ do được execute lại',
			})
			.where('release_execution_id IN (:...ids)', { ids: executionIds })
			.andWhere('status IN (:...jobStatuses)', {
				jobStatuses: [CiJobStatus3.PENDING, CiJobStatus3.PROCESSING],
			})
			.execute();

		// cancel release review
		await this.manager
			.createQueryBuilder()
			.update(ReleaseReview)
			.set({
				status: ReleaseReviewStatus.CANCEL,
			})
			.where('release_execution_id IN (:...ids)', { ids: executionIds })
			.andWhere('status IN (:...reviewStatuses)', {
				reviewStatuses: [
					ReleaseReviewStatus.PENDING,
					ReleaseReviewStatus.PROCESSING,
				],
			})
			.execute();
	}

	private async setStepAndChildrenStatusRecursive({
		step,
		targetStatus,
	}: {
		step: ReleaseExecutionStep3;
		targetStatus: ReleaseExecutionStepStatus;
	}): Promise<void> {
		await this.stepRepo.update(step.id, {
			status: targetStatus,
			startedAt:
				targetStatus === ReleaseExecutionStepStatus.NEW
					? null
					: step.startedAt,
			completedAt: this.getCompletedAtByStatus({
				status: targetStatus,
			}),
			metadata:
				targetStatus === ReleaseExecutionStepStatus.NEW
					? this.resetStepMetadataForRetry(step.metadata)
					: step.metadata,
		});

		const children = await this.stepRepo.find({
			where: {
				parentStepId: step.id,
			},
		});

		for (const child of children) {
			await this.setStepAndChildrenStatusRecursive({
				step: child,
				targetStatus,
			});
		}
	}

	private resetStepMetadataForRetry(
		metadata: Record<string, any> | null,
	): Record<string, any> {
		const retryMetadata = { ...(metadata ?? {}) };
		delete retryMetadata.scheduledAt;

		return {
			...retryMetadata,
			output: null,
		};
	}

	private getCompletedAtByStatus({
		status,
	}: {
		status: ReleaseExecutionStepStatus;
	}): Date | null {
		if (status === ReleaseExecutionStepStatus.NEW) {
			return null;
		}

		if (
			[
				ReleaseExecutionStepStatus.DONE,
				ReleaseExecutionStepStatus.FAILED,
				ReleaseExecutionStepStatus.SKIPPED,
				ReleaseExecutionStepStatus.CANCELLED,
			].includes(status)
		) {
			return new Date();
		}

		return null;
	}

	async retryStep(stepId: string, isOverrideStatus?: boolean): Promise<void> {
		const step = await this.stepRepo.findOne({
			where: { id: stepId },
		});

		if (!step) throw new Error('Step not found');

		if (isOverrideStatus) {
			step.metadata = {
				...step.metadata,
				input: {
					...step.metadata?.input,
					isOverrideStatus: true,
				},
			};
			await this.stepRepo.save(step);
		} else {
			const existedOverride = !!step.metadata?.input?.isOverrideStatus;
			if (existedOverride) {
				step.metadata = {
					...step.metadata,
					input: {
						...step.metadata?.input,
						isOverrideStatus: false,
					},
				};
				await this.stepRepo.save(step);
			}
		}

		await this.setStepAndChildrenStatusRecursive({
			step,
			targetStatus: ReleaseExecutionStepStatus.NEW,
		});

		// enqueue pipeline để xử lý async vì runPipeline nặng
		await this.queueService.queueRunPipeline(step.releaseExecutionId);
	}

	async autoRetrySyncDataDspCiFailedSteps() {
		const errors: { stepId: string; message: string }[] = [];
		const processedExecutionIds = new Set<string>();
		let totalExecutions = 0;
		let retried = 0;

		while (true) {
			const listQuery = Object.assign(
				new QueryGetListReleaseExecution3Dto(),
				{
					page: 1,
					pageSize: 100,
					latestOnly: true,
					steps: [
						{
							type: ReleaseExecutionStepType.SYNC_DATA_DSP_CI,
							status: ReleaseExecutionStepStatus.FAILED,
						},
					],
				},
			);

			const qb = this.queryService.createQbGetList(listQuery);

			if (processedExecutionIds.size) {
				qb.andWhere('execution.id NOT IN (:...processedExecutionIds)', {
					processedExecutionIds: [...processedExecutionIds],
				});
			}

			orderAndPaging2({ qb, filter: listQuery });

			const executions = await qb.getMany();
			const executionIds = executions.map((item) => item.id);

			if (!executionIds.length) break;

			for (const executionId of executionIds) {
				processedExecutionIds.add(executionId);
			}

			totalExecutions += executionIds.length;

			const steps = await this.stepRepo.find({
				where: {
					releaseExecutionId: In(executionIds),
					type: ReleaseExecutionStepType.SYNC_DATA_DSP_CI,
					status: ReleaseExecutionStepStatus.FAILED,
				},
			});

			for (const step of steps) {
				try {
					await this.retryStep(step.id);
					retried++;
				} catch (error) {
					errors.push({
						stepId: step.id,
						message:
							error instanceof Error
								? error.message
								: String(error),
					});
				}
			}
		}

		return {
			totalExecutions,
			retried,
			failed: errors.length,
			errors,
		};
	}

	async updateStatusStepAndRerunPipeline({
		stepId,
		status,
	}: {
		stepId: string;
		status: ReleaseExecutionStepStatus;
	}) {
		const step = await this.stepRepo.findOne({
			where: { id: stepId },
			relations: { childSteps: true },
		});

		if (!step) throw new Error('Step not found');

		await this.stepRepo.update(step.id, {
			status,
			completedAt: [
				ReleaseExecutionStepStatus.DONE,
				ReleaseExecutionStepStatus.FAILED,
				ReleaseExecutionStepStatus.SKIPPED,
				ReleaseExecutionStepStatus.CANCELLED,
			].includes(status)
				? new Date()
				: null,
		});

		// enqueue pipeline để xử lý async
		await this.queueService.queueRunPipeline(step.releaseExecutionId);
	}

	async findOne(id: string) {
		return this.queryService.findOne(id);
	}
}
