import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReleaseExecution3 } from '../../entites/release-execution3.entity';
import {
	ReleaseExecution3RunPipelineQueue,
	RunPipelineQueueStatus,
} from '../../entites/release-execution3.queue.entity';
import { ReleaseExecutionStatus } from '../../enums/release-execution3.enum';
import { ReleaseExecution3Service } from '../release-execution3.service';

@Injectable()
export class ReleaseExecution3Consumer {
	private readonly logger = new Logger(ReleaseExecution3Consumer.name);
	private isConsumingExecutions = false;
	private isConsumingRunPipeline = false;

	constructor(
		private readonly executionService: ReleaseExecution3Service,

		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,

		@InjectRepository(ReleaseExecution3RunPipelineQueue)
		private readonly runPipelineQueueRepo: Repository<ReleaseExecution3RunPipelineQueue>,
	) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async consumerExecutions() {
		if (this.isConsumingExecutions) {
			this.logger.warn(
				'consumerExecutions is already running, skip this tick',
			);
			return;
		}
		this.isConsumingExecutions = true;

		try {
			const executions = await this.executionRepo.find({
				where: { status: ReleaseExecutionStatus.NEW },
				order: { createdAt: 'ASC' },
			});

			if (executions.length === 0) return;

			// Group theo releaseId, chỉ giữ cái mới nhất
			const latestByRelease = new Map<string, ReleaseExecution3>();
			for (const exe of executions) {
				const existing = latestByRelease.get(exe.releaseId);
				if (!existing || exe.createdAt > existing.createdAt) {
					latestByRelease.set(exe.releaseId, exe);
				}
			}

			// Cancel tất cả các bản ghi không được chọn
			const selectedIds = new Set(
				[...latestByRelease.values()].map((e) => e.id),
			);
			const toCancel = executions.filter((e) => !selectedIds.has(e.id));

			if (toCancel.length > 0) {
				await this.executionRepo.update(
					toCancel.map((e) => e.id),
					{ status: ReleaseExecutionStatus.CANCELLED },
				);
				this.logger.log(
					`Cancelled ${toCancel.length} duplicate executions`,
				);
			}

			// Chỉ xử lý các execution được chọn
			const selected = [...latestByRelease.values()];
			this.logger.log(
				`Found ${selected.length} NEW executions to process`,
			);

			for (const execution of selected) {
				try {
					this.logger.log(
						`Start processing execution ${execution.id}`,
					);
					await this.executionService.startProcessing(execution.id);
					this.logger.log(`Finished execution ${execution.id}`);
				} catch (error) {
					this.logger.error(
						`Failed processing execution ${execution.id}`,
						error as Error,
					);
				}
			}
		} finally {
			this.isConsumingExecutions = false;
		}
	}

	@Cron(CronExpression.EVERY_30_SECONDS)
	async consumeRunPipelineQueue() {
		if (this.isConsumingRunPipeline) {
			this.logger.warn(
				'consumeRunPipelineQueue is already running, skip this tick',
			);
			return;
		}

		this.isConsumingRunPipeline = true;

		try {
			const jobs = await this.runPipelineQueueRepo.find({
				where: { status: RunPipelineQueueStatus.NEW },
				order: { createdAt: 'ASC' },
			});

			if (jobs.length === 0) return;

			// Group theo releaseExecutionId, chỉ giữ cái mới nhất
			const latestByExecution = new Map<
				string,
				ReleaseExecution3RunPipelineQueue
			>();
			for (const job of jobs) {
				const existing = latestByExecution.get(job.releaseExecutionId);
				if (!existing || job.createdAt > existing.createdAt) {
					latestByExecution.set(job.releaseExecutionId, job);
				}
			}

			// Failed tất cả các job không được chọn
			const selectedIds = new Set(
				[...latestByExecution.values()].map((j) => j.id),
			);
			const toFail = jobs.filter((j) => !selectedIds.has(j.id));

			if (toFail.length > 0) {
				await this.runPipelineQueueRepo.update(
					toFail.map((j) => j.id),
					{
						status: RunPipelineQueueStatus.FAILED,
						error: 'Superseded by a newer job for the same execution',
						completedAt: new Date(),
					},
				);
				this.logger.log(
					`Failed ${toFail.length} duplicate run pipeline jobs`,
				);
			}

			const selected = [...latestByExecution.values()];
			this.logger.log(`Found ${selected.length} run pipeline jobs`);

			for (const job of selected) {
				try {
					await this.runPipelineQueueRepo.update(job.id, {
						status: RunPipelineQueueStatus.PROCESSING,
						startedAt: new Date(),
					});

					this.logger.log(
						`Start processing execution ${job.releaseExecutionId}`,
					);

					await this.executionService.runPipeline(
						job.releaseExecutionId,
					);

					await this.runPipelineQueueRepo.update(job.id, {
						status: RunPipelineQueueStatus.DONE,
						completedAt: new Date(),
					});

					this.logger.log(
						`Finished execution ${job.releaseExecutionId}`,
					);
				} catch (error) {
					await this.runPipelineQueueRepo.update(job.id, {
						status: RunPipelineQueueStatus.FAILED,
						error:
							error instanceof Error
								? error.message
								: String(error),
						completedAt: new Date(),
					});

					this.logger.error(
						`Failed execution ${job.releaseExecutionId}`,
						error as Error,
					);
				}
			}
		} finally {
			this.isConsumingRunPipeline = false;
		}
	}
}
