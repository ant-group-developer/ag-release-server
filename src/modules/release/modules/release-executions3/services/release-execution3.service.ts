import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import { QueryGetListReleaseExecution3Dto } from '../dtos/release-execution3.dto';
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
		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,

		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		private readonly execution3Builder: ReleaseExecution3Builder,
		private readonly engine: ReleaseExecutionStepEngine,
	) {}

	// new
	async newExecution(body: {
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

		return this.findOne(execution.id);
	}

	// processing
	async startProcessing(id: string): Promise<void> {
		const execution = await this.findOne(id);

		if (execution.status !== ReleaseExecutionStatus.NEW) {
			throw new Error('Only execution with NEW status can be started');
		}

		await this.executionRepo.update(id, {
			status: ReleaseExecutionStatus.PROCESSING,
		});

		await this.execution3Builder.startBuildPipeline(execution);
	}

	async retryStep(stepId: string) {
		const step = await this.stepRepo.findOne({
			where: { id: stepId },
		});

		if (!step) {
			throw new NotFoundException('Step not found');
		}

		await this.stepRepo.update(step.id, {
			status: ReleaseExecutionStepStatus.NEW,
			startedAt: null,
			completedAt: null,
		});

		// return this.engine.runByStepId(stepId);
	}

	// async runStep(stepId: string) {
	// 	return this.engine.runByStepId(stepId);
	// }

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
			},
			order: {
				order: 'ASC',
			},
		});

		entity.steps = this.buildStepTreeList(steps);

		return entity;
	}
}
