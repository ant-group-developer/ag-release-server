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

		private readonly builder: ReleaseExecution3Builder,
		private readonly engine: ReleaseExecutionStepEngine,
	) {}

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

		this.startProcessing(execution.id).catch((e) => console.log(e))
		return this.findOne(execution.id);
	}

	// processing
	async startProcessing(id: string): Promise<void> {
		const execution = await this.findOne(id);

		if (execution.status !== ReleaseExecutionStatus.NEW) {
			throw new Error('Only execution with NEW status can be started');
		}

		execution.status = ReleaseExecutionStatus.PROCESSING;
		await this.executionRepo.save(execution);

		await this.builder.startBuildPipeline(execution);

		const freshExecution = await this.findOne(id);
		const steps = freshExecution.steps || [];

		for (const step of steps) {
			const status = await this.engine.processStep(step);

			if (this.shouldStopSequential(status)) {
				await this.updateExecutionStatus(
					freshExecution,
					this.mapStepStatusToExecutionStatus(status),
				);

				return;
			}
		}

		await this.refreshExecutionStatus(freshExecution);
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


	// chua check
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
