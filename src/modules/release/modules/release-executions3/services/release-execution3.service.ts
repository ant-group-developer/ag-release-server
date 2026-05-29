import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { LogsService } from 'src/modules/log/services/logs.services';
import { Release } from 'src/modules/release/entities/release.entity';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
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
		private readonly releaseExecutionStep3Repo: Repository<ReleaseExecutionStep3>,

		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,
		private readonly dspRoutingService: DspRoutingConfigsService,

		private readonly builder: ReleaseExecution3Builder,
		private readonly engine: ReleaseExecutionStepEngine,

		private readonly logService: LogsService,
	) { }

	async retryStep(stepId: string): Promise<void> {
		const step = await this.stepRepo.findOne({
			where: { id: stepId },
			relations: { childSteps: true },
		});

		if (!step) throw new Error('Step not found');
		if (step.status !== ReleaseExecutionStepStatus.FAILED) {
			throw new Error('Only FAILED step can be retried');
		}

		// cập nhật lại trạng thái của nó là new, gọi lại full luồng engine sẽ tự xử lý lại

		await this.runPipeline(step.releaseExecutionId);
	}

	// Được gọi từ bên ngoài (vd: CiJob bị user skip) để đánh dấu step là FAILED
	async failStep(stepId: string): Promise<void> {

	}

	// // @Cron('* * * * * *') // 1s
	// // @Cron('*/10 * * * * *') // 10s
	// // @Cron('*/3 * * * *') // 3 phut
	// @Cron('* * * * *') // mỗi 1 phút
	// async resumeWaitingSteps(): Promise<void> {
	// 	const now = new Date();

	// 	const waitingSteps = await this.manager.find(ReleaseExecutionStep3, {
	// 		where: {
	// 			status: ReleaseExecutionStepStatus.WAITING_PARTNER,
	// 		},
	// 	});

	// 	// Group theo executionId, chỉ resume 1 lần mỗi execution
	// 	const executionIds = [
	// 		...new Set(
	// 			waitingSteps
	// 				.filter((step) => {
	// 					const scheduledAt = step.metadata?.scheduledAt;
	// 					return scheduledAt && new Date(scheduledAt) <= now;
	// 				})
	// 				.map((step) => step.releaseExecutionId),
	// 		),
	// 	];

	// 	console.log(
	// 		`[ReleaseExecution3Service] Found ${waitingSteps.length} waiting steps, ${executionIds.length} executions to resume`,
	// 	); // log thêm

	// 	for (const executionId of executionIds) {
	// 		await this.runPipeline(executionId);
	// 	}
	// }

	async resumeFromWaiting(stepId: string): Promise<void> {
		const step = await this.releaseExecutionStep3Repo.findOne({
			where: { id: stepId },
		});

		if (!step) {
			throw new NotFoundException('Step not found');
		}

		if (step.status === ReleaseExecutionStepStatus.WAITING_ACTION) {
			const claim = await this.releaseExecutionStep3Repo.update(
				{
					id: stepId,
					status: ReleaseExecutionStepStatus.WAITING_ACTION,
				},
				{
					status: ReleaseExecutionStepStatus.PROCESSING,
				},
			);

			if (claim.affected === 0) {
				throw new Error('Step đang được xử lý bởi tiến trình khác');
			}
		} else if (step.status !== ReleaseExecutionStepStatus.PROCESSING) {
			throw new Error(`Step status invalid: ${step.status}`);
		}

		await this.releaseExecutionStep3Repo.update(stepId, {
			status: ReleaseExecutionStepStatus.DONE,
			metadata: {
				...step.metadata,
				output: {
					...step.metadata?.output,
					completed: true,
				},
			},
			completedAt: new Date(),
		});

		await this.runPipeline(step.releaseExecutionId);
	}

	async runPipeline(id: string): Promise<void> {
		const execution = await this.findOne(id);
		const steps = execution.steps || [];

		for (const step of steps) {
			const status = await this.engine.processStep({
				step,
				releaseExecution: execution,
			});

			if (this.shouldStopSequential(status)) {
				await this.updateExecutionStatus(
					execution,
					this.mapStepStatusToExecutionStatus(status),
				);
				return;
			}
		}

		await this.refreshExecutionStatus(execution);
	}

	// main
	async startProcessing(id: string): Promise<void> {
		const execution = await this.findOne(id);

		if (execution.status !== ReleaseExecutionStatus.NEW) {
			throw new Error('Only execution with NEW status can be started');
		}

		await this.cancelPendingExecutions(
			execution.metadata.input.releaseSnapshot.id,
		);

		execution.status = ReleaseExecutionStatus.PROCESSING;
		await this.executionRepo.save(execution);

		await this.parseMetadata(execution);

		await this.builder.buildStepsChild({ releaseExecution: execution });

		await this.runPipeline(id);
	}

	// new
	async newJob(body: {
		release: Release;
		dspCodes: string[];
		type: ExecutionType;
	}) {
		const execution = await this.executionRepo.save(
			this.executionRepo.create({
				releaseId: body.release.id,
				type: body.type,
				status: ReleaseExecutionStatus.NEW,
				releaseTitle: body.release.title,
				releaseUpc: body.release.upc ?? '',
				metadata: {
					input: {
						releaseSnapshot: body.release,
						dspCodes: body.dspCodes,
					},
					output: {
						result: [],
					},
				},
			}),
		);

		await this.startProcessing(execution.id);
		// .catch((e) => console.log(e));
		return this.findOne(execution.id);
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

		await this.updateExecutionStatus(execution, status);

		return status;
	}

	//
	private async updateExecutionStatus(
		execution: ReleaseExecution3,
		status: ReleaseExecutionStatus,
		summary?: string,
	): Promise<void> {
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

	private async cancelPendingExecutions(releaseId: string) {
		const pendingStatuses = [
			ReleaseExecutionStatus.NEW,
			ReleaseExecutionStatus.PROCESSING,
			ReleaseExecutionStatus.WAITING_PARTNER,
			ReleaseExecutionStatus.WAITING_ACTION,
		];

		const pendingExecutions = await this.executionRepo.find({
			where: { releaseId, status: In(pendingStatuses) },
			select: ['id'],
		});

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

		await this.releaseExecutionStep3Repo
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
				status: CiJobStatus3.SKIPPED,
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
}
