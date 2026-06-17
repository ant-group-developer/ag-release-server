import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { QueryGetListReleaseExecution3Dto } from '../dtos/release-execution3.dto';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ReleaseExecutionStatus,
	ReleaseExecutionStepStatus,
} from '../enums/release-execution3.enum';

@Injectable()
export class ReleaseExecution3QueryService {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,
	) {}

	async getPendingExecutions({
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

		return pendingExecutions;
	}

	async getListWaitingSteps(now: Date): Promise<ReleaseExecutionStep3[]> {
		return this.stepRepo
			.createQueryBuilder('step')
			.innerJoin(
				ReleaseExecution3,
				'execution',
				'execution.id = step.releaseExecutionId',
			)
			.where('step.status = :stepStatus', {
				stepStatus: ReleaseExecutionStepStatus.WAITING_PARTNER,
			})
			.andWhere("step.metadata->>'scheduledAt' IS NOT NULL")
			.andWhere("(step.metadata->>'scheduledAt')::timestamptz <= :now", {
				now,
			})
			.andWhere('execution.status IN (:...executionStatuses)', {
				executionStatuses: [
					ReleaseExecutionStatus.PROCESSING,
					ReleaseExecutionStatus.WAITING_PARTNER,
				],
			})
			.getMany();
	}

	createQbGetList(query: QueryGetListReleaseExecution3Dto) {
		const qb = this.executionRepo.createQueryBuilder('execution');

		const keywords = [...(query.keyword ?? [])].filter(
			(keyword) => !!keyword?.trim(),
		);

		if (keywords.length) {
			qb.andWhere(
				new Brackets((keywordQb) => {
					keywords.forEach((keyword, index) => {
						const paramKey = `keyword${index}`;
						const condition = `(
								execution.release_upc ILIKE :${paramKey}
								OR execution.release_title ILIKE :${paramKey}
							)`;
						const params = { [paramKey]: `%${keyword}%` };

						if (index === 0) {
							keywordQb.where(condition, params);
						} else {
							keywordQb.orWhere(condition, params);
						}
					});
				}),
			);
		}

		if (query.latestOnly) {
			const latestExecutionSubQuery = this.executionRepo
				.createQueryBuilder('latestExecution')
				.select('latestExecution.id')
				.distinctOn(['latestExecution.releaseId'])
				.orderBy('latestExecution.releaseId', 'ASC')
				.addOrderBy('latestExecution.createdAt', 'DESC')
				.addOrderBy('latestExecution.id', 'DESC')
				.getQuery();

			qb.andWhere(`execution.id IN (${latestExecutionSubQuery})`);
		}

		if (query.releaseIds?.length) {
			qb.andWhere('execution.releaseId IN (:...releaseIds)', {
				releaseIds: query.releaseIds,
			});
		} else if (query.queryListReleases) {
			qb.andWhere('1 = 0');
		}

		this.applyStepFilter(qb, query);

		if (query.startCreatedAt) {
			qb.andWhere('execution.createdAt >= :startCreatedAt', {
				startCreatedAt: query.startCreatedAt,
			});
		}

		if (query.endCreatedAt) {
			qb.andWhere('execution.createdAt <= :endCreatedAt', {
				endCreatedAt: query.endCreatedAt,
			});
		}

		if (query.status?.length) {
			qb.andWhere('execution.status IN (:...statuses)', {
				statuses: query.status,
			});
		}

		return qb;
	}

	private applyStepFilter(
		qb: ReturnType<Repository<ReleaseExecution3>['createQueryBuilder']>,
		query: QueryGetListReleaseExecution3Dto,
	) {
		const stepFilters = (query.steps ?? []).filter(
			(step) => step?.type || step?.status,
		);

		if (!stepFilters.length) return;

		const params: Record<string, string> = {};

		stepFilters.forEach((step, index) => {
			const conditions: string[] = [];

			if (step.type) {
				const paramKey = `stepType${index}`;
				conditions.push(`stepFilter.type = :${paramKey}`);
				params[paramKey] = step.type;
			}

			if (step.status) {
				const paramKey = `stepStatus${index}`;
				conditions.push(`stepFilter.status = :${paramKey}`);
				params[paramKey] = step.status;
			}

			const existsOperator = step.exclude ? 'NOT EXISTS' : 'EXISTS';

			qb.andWhere(
				`${existsOperator} (
						SELECT 1
						FROM release_execution_steps3 stepFilter
						WHERE stepFilter.release_execution_id = execution.id
						AND ${conditions.join(' AND ')}
					)`,
			);
		});

		qb.setParameters(params);
	}

	async getStatusCounts(
		query: QueryGetListReleaseExecution3Dto,
	): Promise<Record<string, number>> {
		const qb = this.createQbGetList(query);

		const rawResults = await qb
			.select('execution.status', 'status')
			.addSelect('COUNT(DISTINCT execution.id)', 'count')
			.groupBy('execution.status')
			.getRawMany<{ status: ReleaseExecutionStatus; count: string }>();

		const counts = Object.fromEntries(
			Object.values(ReleaseExecutionStatus).map((s) => [s, 0]),
		);

		for (const { status, count } of rawResults) {
			if (status in counts) counts[status] = parseInt(count, 10);
		}

		return counts;
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
}
