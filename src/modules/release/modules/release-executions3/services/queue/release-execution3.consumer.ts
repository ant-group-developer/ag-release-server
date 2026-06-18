import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ReleaseExecution3 } from '../../entites/release-execution3.entity';
import {
	ReleaseExecution3RunPipelineQueue,
	RunPipelineQueueStatus,
} from '../../entites/release-execution3.queue.entity';
import { ReleaseExecutionStatus } from '../../enums/release-execution3.enum';
import { ReleaseExecution3Service } from '../release-execution3.service';

const DEFAULT_TRACK_DISK_BYTES = 30 * 1024 * 1024;
const MAX_PIPELINE_DISK_BYTES = 25 * 1024 * 1024 * 1024;

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
				await Promise.all(
					[...latestByRelease.values()].map((execution) =>
						this.executionService.cancelPendingExecutions({
							releaseId: execution.releaseId,
							excludeExecutionId: execution.id,
						}),
					),
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
					// this.logger.log(
					// 	`Start processing execution ${execution.id}`,
					// );
					await this.executionService.startProcessing(execution.id);
					// this.logger.log(`Finished execution ${execution.id}`);
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

			// Lấy execution snapshot để ước tính dung lượng audio của từng job.
			const candidates = [...latestByExecution.values()];
			const executions = await this.executionRepo.find({
				where: {
					id: In(candidates.map((job) => job.releaseExecutionId)),
				},
			});
			const executionById = new Map(
				executions.map((execution) => [execution.id, execution]),
			);

			// Chọn nhiều job nhất có thể nhưng tổng dung lượng ước tính
			// của batch không vượt quá giới hạn disk.
			const { selected, oversized } = this.selectPipelineBatch({
				jobs: candidates,
				executionById,
			});

			// Job đơn lẻ đã vượt giới hạn sẽ không bao giờ vừa batch,
			// nên đánh dấu FAILED để tránh bị giữ ở trạng thái NEW mãi.
			if (oversized.length > 0) {
				await this.runPipelineQueueRepo.update(
					oversized.map((item) => item.job.id),
					{
						status: RunPipelineQueueStatus.FAILED,
						error: 'Estimated disk usage exceeds the 10 GiB limit',
						completedAt: new Date(),
					},
				);
			}

			// Ghi lại kế hoạch sử dụng disk của batch trước khi thực thi.
			const estimatedBytes = selected.reduce(
				(total, item) => total + item.estimatedBytes,
				0,
			);
			this.logger.log(
				`Processing ${selected.length}/${candidates.length} pipeline jobs concurrently, estimated disk ${this.formatBytes(estimatedBytes)}`,
			);

			// Các job trong batch chạy đồng thời; lỗi của một job không làm
			// dừng hoặc reject toàn bộ các job còn lại.
			await Promise.allSettled(
				selected.map(({ job }) => this.processRunPipelineJob(job)),
			);
		} finally {
			this.isConsumingRunPipeline = false;
		}
	}

	private selectPipelineBatch({
		jobs,
		executionById,
	}: {
		jobs: ReleaseExecution3RunPipelineQueue[];
		executionById: Map<string, ReleaseExecution3>;
	}) {
		// Ưu tiên release nhỏ để chạy đồng thời được nhiều release nhất,
		// nhưng tổng dung lượng tạm ước tính không vượt giới hạn disk.
		const estimatedJobs = jobs
			.map((job) => ({
				job,
				estimatedBytes: this.estimateExecutionDiskBytes(
					executionById.get(job.releaseExecutionId),
				),
			}))
			.sort(
				(a, b) =>
					a.estimatedBytes - b.estimatedBytes ||
					a.job.createdAt.getTime() - b.job.createdAt.getTime(),
			);

		const oversized = estimatedJobs.filter(
			(item) => item.estimatedBytes > MAX_PIPELINE_DISK_BYTES,
		);
		const selected: typeof estimatedJobs = [];
		let totalBytes = 0;

		for (const item of estimatedJobs) {
			if (item.estimatedBytes > MAX_PIPELINE_DISK_BYTES) continue;
			if (totalBytes + item.estimatedBytes > MAX_PIPELINE_DISK_BYTES) {
				break;
			}

			selected.push(item);
			totalBytes += item.estimatedBytes;
		}

		return { selected, oversized };
	}

	private estimateExecutionDiskBytes(execution?: ReleaseExecution3): number {
		// Ưu tiên dung lượng file thực tế; snapshot cũ hoặc thiếu dữ liệu
		// sẽ dùng dung lượng trung bình mặc định cho mỗi track.
		const tracks =
			execution?.metadata?.input?.releaseSnapshot?.tracks ?? [];

		if (tracks.length === 0) return DEFAULT_TRACK_DISK_BYTES;

		return tracks.reduce((total, track) => {
			const fileSize = Number(track.audioFile?.file?.fileSize);
			return (
				total +
				(Number.isFinite(fileSize) && fileSize > 0
					? fileSize
					: DEFAULT_TRACK_DISK_BYTES)
			);
		}, 0);
	}

	private async processRunPipelineJob(
		job: ReleaseExecution3RunPipelineQueue,
	): Promise<void> {
		// Tách xử lý từng job để các job chạy song song tự quản lý trạng thái
		// thành công/thất bại mà không ảnh hưởng các job còn lại.
		try {
			await this.runPipelineQueueRepo.update(job.id, {
				status: RunPipelineQueueStatus.PROCESSING,
				startedAt: new Date(),
			});

			this.logger.log(
				`Start processing execution ${job.releaseExecutionId}`,
			);
			await this.executionService.runPipeline(job.releaseExecutionId);

			await this.runPipelineQueueRepo.update(job.id, {
				status: RunPipelineQueueStatus.DONE,
				completedAt: new Date(),
			});
			this.logger.log(`Finished execution ${job.releaseExecutionId}`);
		} catch (error) {
			await this.runPipelineQueueRepo.update(job.id, {
				status: RunPipelineQueueStatus.FAILED,
				error: error instanceof Error ? error.message : String(error),
				completedAt: new Date(),
			});
			this.logger.error(
				`Failed execution ${job.releaseExecutionId}`,
				error as Error,
			);
		}
	}

	private formatBytes(bytes: number): string {
		// Chỉ dùng để hiển thị dung lượng dễ đọc trong log.
		return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
	}
}
