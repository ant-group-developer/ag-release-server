import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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

		private readonly builder: ReleaseExecution3Builder,
		private readonly engine: ReleaseExecutionStepEngine,
	) {}

	async submit(body: {
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

		await this.builder.buildPipeline(execution.id);
		await this.engine.runByExecutionId(execution.id);

		return this.findOne(execution.id);
	}

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

		return {
			items,
			total,
			page,
			pageSize,
		};
	}

	async findOne(id: string) {
		const execution = await this.executionRepo.findOne({
			where: { id },
		});

		if (!execution) {
			throw new NotFoundException('Execution not found');
		}

		const steps = await this.stepRepo.find({
			where: { releaseExecutionId: id },
			order: { order: 'ASC' },
		});

		return {
			...execution,
			steps: this.buildStepTree(steps),
		};
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

		return this.engine.runByStepId(stepId);
	}

	async runStep(stepId: string) {
		return this.engine.runByStepId(stepId);
	}

	private buildStepTree(
		steps: ReleaseExecutionStep3[],
	): ReleaseExecutionStep3[] {
		const stepMap = new Map<string, ReleaseExecutionStep3>();
		const roots: ReleaseExecutionStep3[] = [];

		for (const step of steps) {
			step.childSteps = [];
			stepMap.set(step.id, step);
		}

		for (const step of steps) {
			if (!step.parentStepId) {
				roots.push(step);
				continue;
			}

			const parent = stepMap.get(step.parentStepId);

			if (parent) {
				step.parentStep = parent;
				parent.childSteps.push(step);
			}
		}

		for (const step of steps) {
			step.childSteps.sort((a, b) => a.order - b.order);
		}

		return roots.sort((a, b) => a.order - b.order);
	}
}
