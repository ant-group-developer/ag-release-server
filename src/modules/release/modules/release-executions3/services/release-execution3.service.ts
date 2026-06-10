import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { LogsService } from 'src/modules/log/services/logs.services';
import { Release } from 'src/modules/release/entities/release.entity';
import { EntityManager, In, Repository } from 'typeorm';
import { QueryGetListReleaseExecution3Dto } from '../dtos/release-execution3.dto';
import {
	CiDistributionJob3,
	CiJobStatus3,
} from '../entites/ci-distribution-job3.entity';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ExecutionType,
	ReleaseExecutionStatus,
	ReleaseExecutionStepStatus,
} from '../enums/release-execution3.enum';
import { ReleaseExecution3Queue } from './queue/release-execution3.queue';
import { ReleaseExecution3Builder } from './release-execution3.builder';
import { ReleaseExecutionStepEngine } from './release-execution3.engine';

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

		private readonly builder: ReleaseExecution3Builder,
		private readonly engine: ReleaseExecutionStepEngine,

		private readonly logService: LogsService,
		private readonly queueService: ReleaseExecution3Queue,
	) {}

	// đã handle
	// đẩy vào queue, consumer tự quét và xử lí
	async newReleaseExecution(body: {
		release: Release;
		dspCodes: string[];
		type: ExecutionType;
	}) {
		return await this.queueService.queueExecution(body);
	}

	// lấy ra các bản ghi đang ở WAITING_PARTNER đã tới giờ xử lí, worker sẽ update trạng thái
	// @Cron('* * * * * *') // 1s
	// @Cron('*/10 * * * * *') // 10s
	// @Cron('*/3 * * * *') // 3 phut
	@Cron('* * * * *') // mỗi 1 phút
	async resumeWaitingSteps(): Promise<void> {
		const now = new Date();

		const waitingSteps = await this.manager.find(ReleaseExecutionStep3, {
			where: {
				status: ReleaseExecutionStepStatus.WAITING_PARTNER,
			},
		});

		// Group theo executionId, chỉ resume 1 lần mỗi execution
		const executionIds = [
			...new Set(
				waitingSteps
					.filter((step) => {
						const scheduledAt = step.metadata?.scheduledAt;
						return scheduledAt && new Date(scheduledAt) <= now;
					})
					.map((step) => step.releaseExecutionId),
			),
		];

		console.log(
			`[ReleaseExecution3Service] Found ${waitingSteps.length} waiting steps, ${executionIds.length} executions to resume`,
		); // log thêm

		for (const executionId of executionIds) {
			await this.queueService.queueRunPipeline(executionId);
		}
	}

	// main
	async startProcessing(id: string): Promise<void> {
		const execution = await this.findOne(id);

		if (execution.status !== ReleaseExecutionStatus.NEW) {
			throw new Error('Only execution with NEW status can be started');
		}

		// cancel job cũ
		await this.cancelPendingExecutions({
			releaseId: execution.metadata.input.releaseSnapshot.id,
			excludeExecutionId: id,
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
		// lấy exe, lấy xử lý từng job theo đồng bộ
		const execution = await this.findOne(id);
		const steps = execution.steps || [];

		// xử lý từng step
		for (const step of steps) {
			const status = await this.engine.processStep({
				step,
				releaseExecution: execution,
			});

			if (this.shouldStopSequential(status)) {
				await this.updateExecutionStatus({
					execution,
					status: this.mapStepStatusToExecutionStatus(status),
				});
				return;
			}
		}

		// xử lý status sau khi các step đã xử lí
		await this.refreshExecutionStatus(execution);
	}

	private async parseMetadata(execution: ReleaseExecution3): Promise<void> {
		const { dspCodes } = execution.metadata.input;

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

		execution.metadata.input.dspAggregator = {
			ci: {
				ci: ciDealDsps,
				state51: state51Dsps,
				primaryDsp: null,
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

		for (const dsp of ciDsps) {
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
	}

	private buildDeliveryMetadataInput(releaseId: string, dsps: Dsp[]) {
		return {
			releaseId,
			items: dsps
				.filter((dsp) => !!dsp.id)
				.map((dsp) => ({
					dspId: dsp.id,
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

		await this.executionRepo.save(execution);
	}

	private isFinalExecutionStatus(status: ReleaseExecutionStatus): boolean {
		return [
			ReleaseExecutionStatus.DONE,
			ReleaseExecutionStatus.FAILED,
			ReleaseExecutionStatus.CANCELLED,
			ReleaseExecutionStatus.PARTIAL_DONE,
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

		if (
			statuses.includes(ReleaseExecutionStepStatus.DONE) &&
			(statuses.includes(ReleaseExecutionStepStatus.FAILED) ||
				statuses.includes(ReleaseExecutionStepStatus.CANCELLED))
		) {
			return ReleaseExecutionStatus.PARTIAL_DONE;
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
		const page = query.page || 1;
		const pageSize = query.pageSize || 10;

		const qb = this.executionRepo
			.createQueryBuilder('execution')
			.orderBy('execution.createdAt', 'DESC')
			.skip((page - 1) * pageSize)
			.take(pageSize);

		if (query.releaseId) {
			qb.andWhere('execution.releaseId = :releaseId', {
				releaseId: query.releaseId,
			});
		}

		if (query.status) {
			qb.andWhere('execution.status = :status', {
				status: query.status,
			});
		}

		const [items, total] = await qb.getManyAndCount();

		return new PageDto({
			metadata: { totalItems: total, page, pageSize },
			items,
		});
	}

	async findOne(id: string) {
		const entity = await this.executionRepo.findOne({
			where: { id },
			relations: {
				logs: true,
			},
		});

		if (!entity) {
			throw new NotFoundException('Release submit not found');
		}

		const steps = await this.stepRepo.find({
			where: {
				releaseExecutionId: id,
			},
			relations: {
				logs: true,
				// parentStep: true,
			},
			order: {
				order: 'ASC',
			},
		});

		entity.steps = this.buildStepTreeList(steps);

		return entity;
	}

	private buildStepTreeList(steps: ReleaseExecutionStep3[]) {
		const map = new Map<string, ReleaseExecutionStep3>();
		const roots: ReleaseExecutionStep3[] = [];

		for (const step of steps) {
			step.childSteps = [];
			map.set(step.id, step);
		}

		for (const step of steps) {
			if (!step.parentStepId) {
				roots.push(step);
				continue;
			}

			const parent = map.get(step.parentStepId);

			if (!parent) {
				roots.push(step);
				continue;
			}

			parent.childSteps?.push(step);
		}

		return roots;
	}

	private async cancelPendingExecutions({
		releaseId,
		excludeExecutionId,
	}: {
		releaseId: string;
		excludeExecutionId?: string;
	}) {
		const pendingStatuses = [
			ReleaseExecutionStatus.NEW,
			ReleaseExecutionStatus.PROCESSING,
			ReleaseExecutionStatus.WAITING_PARTNER,
			ReleaseExecutionStatus.WAITING_ACTION,
		];

		const qb = this.executionRepo
			.createQueryBuilder('execution')
			.select('execution.id', 'id')
			.where('execution.releaseId = :releaseId', { releaseId })
			.andWhere('execution.status IN (:...statuses)', {
				statuses: pendingStatuses,
			});

		if (excludeExecutionId) {
			const excludeExecution = await this.executionRepo.findOne({
				where: { id: excludeExecutionId },
				select: ['createdAt'],
			});

			if (excludeExecution) {
				qb.andWhere('execution.id != :excludeExecutionId', {
					excludeExecutionId,
				}).andWhere('execution.createdAt < :createdAt', {
					createdAt: excludeExecution.createdAt,
				});
			}
		}

		const pendingExecutions = await qb.getRawMany<{ id: string }>();

		if (pendingExecutions.length === 0) return;

		const executionIds = pendingExecutions.map((e) => e.id);

		await this.executionRepo
			.createQueryBuilder()
			.update()
			.set({
				status: ReleaseExecutionStatus.CANCELLED,
				completedAt: new Date(),
			})
			.where('id IN (:...ids)', { ids: executionIds })
			.execute();

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
					ReleaseExecutionStepStatus.WAITING_ACTION,
				],
			})
			.execute();

		await this.manager
			.createQueryBuilder()
			.update(CiDistributionJob3)
			.set({
				status: CiJobStatus3.CANCEL,
				note: 'Job execution cha bị huỷ do được execute lại',
			})
			.where('release_execution_id IN (:...ids)', { ids: executionIds })
			.andWhere('status IN (:...jobStatuses)', {
				jobStatuses: [
					CiJobStatus3.PENDING,
					CiJobStatus3.PROCESSING,
					CiJobStatus3.COMPLETED,
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
					? {
							...step.metadata,
							output: null,
						}
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

	async retryStep(stepId: string): Promise<void> {
		const step = await this.stepRepo.findOne({
			where: { id: stepId },
		});

		if (!step) throw new Error('Step not found');

		await this.setStepAndChildrenStatusRecursive({
			step,
			targetStatus: ReleaseExecutionStepStatus.NEW,
		});

		// enqueue pipeline để xử lý async vì runPipeline nặng
		await this.queueService.queueRunPipeline(step.releaseExecutionId);
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
}
