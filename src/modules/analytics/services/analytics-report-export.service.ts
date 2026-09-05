import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import {
	ImportJob,
	ImportJobSourceType,
	ImportJobStatus,
} from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { JobEventsGateway } from 'src/modules/etl/services/import-jobs/job-events.gateway';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';
import {
	AnalyticsReportExportCancelAllResult,
	AnalyticsReportExportCancelListResult,
	AnalyticsReportExportCancelResult,
	AnalyticsReportExportJobResult,
} from '../interfaces/analytics-report-export.interface';
import { ExportWorkerPoolService } from '../workers/export-worker-pool.service';
import { ExportQueueService } from './export-queue.service';

/**
 * AnalyticsReportExportService — quản lý vòng đời job export (tạo / huỷ /
 * cleanup). Việc CHẠY export đã chuyển sang ExportWorkerPoolService
 * (worker_threads) để không chiếm event loop HTTP.
 */
@Injectable()
export class AnalyticsReportExportService {
	private readonly logger = new Logger(AnalyticsReportExportService.name);
	private readonly exportRetentionDays = 7;
	private readonly cleanupBatchSize = 100;
	/** Ngưỡng coi job QUEUED là mắc kẹt. Job lớn vẫn ở QUEUED khi pool đầy nên
	 *  không đặt quá thấp; reaper cũng đã bỏ qua job còn trong Redis. */
	private readonly stuckQueuedMinutes = 15;
	private readonly pendingExportTimeoutMinutes = 60;
	private readonly maxRequeueAttempts = 3;

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly r2Service: BucketR2Service,
		private readonly importJobsService: ImportJobsService,
		private readonly exportQueueService: ExportQueueService,
		private readonly workerPool: ExportWorkerPoolService,
		private readonly jobEvents: JobEventsGateway,
	) {}

	/**
	 * Cancel job bất kể nó đang chạy ở process nào.
	 *
	 * `workerPool.requestCancel()` chỉ set cờ Atomics trên thread trong Map của
	 * process HIỆN TẠI. Với deployment 2 container, job luôn chạy ở container
	 * `worker` còn HTTP cancel đến container `api` → gọi local là no-op: ClickHouse
	 * ghi CANCELLED nhưng worker vẫn chạy tới cùng, vẫn zip, vẫn upload lên R2.
	 * Nên publish qua Redis, và vẫn gọi local để cover trường hợp single-process (dev).
	 */
	private requestCancelAcrossProcesses(jobId: string): void {
		this.workerPool.requestCancel(jobId);
		this.jobEvents.publishCancel(jobId);
	}

	async createExportJob(
		tenantId: string,
		userId: string,
		dto: AnalyticsReportExportDto,
	): Promise<AnalyticsReportExportJobResult> {
		// Hot path HTTP: chỉ tạo job + enqueue rồi return ngay (vài ms). Tên workspace
		// thật được resolve ở worker (ExportRunner) và patch lại fileName sau.
		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
			params: dto as unknown as Record<string, unknown>,
			fileName: this.buildPlaceholderFileName(dto),
			progressTotal: 5,
			tenantId,
			createdBy: userId,
		});

		await this.importJobsService.markQueued(job.id);
		await this.exportQueueService.enqueue(job.id);

		return {
			jobId: job.id,
			status: ImportJobStatus.QUEUED,
			eventsUrl: `/analytics/reports/export/${job.id}/events`,
		};
	}

	async cancelExportJob(
		jobId: string,
		tenantId: string,
	): Promise<AnalyticsReportExportCancelResult> {
		const job = await this.getReadableExportJob(jobId, tenantId);
		if (this.isTerminalStatus(job.status)) {
			return {
				jobId: job.id,
				status: job.status,
				cancelled: job.status === ImportJobStatus.CANCELLED,
			};
		}

		this.requestCancelAcrossProcesses(job.id);
		const cancelledJob = await this.importJobsService.markCancelled(
			job.id,
			'Cancelled by user',
		);
		return {
			jobId: cancelledJob.id,
			status: cancelledJob.status,
			cancelled: cancelledJob.status === ImportJobStatus.CANCELLED,
		};
	}

	async cancelAllExportJobs(
		tenantId: string,
	): Promise<AnalyticsReportExportCancelAllResult> {
		const isSystem = checkIsSystemTenant(tenantId);
		const jobs = await this.importJobsService.findActiveJobsBySource(
			ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
			isSystem ? undefined : tenantId,
		);

		const jobIds: string[] = [];
		let skippedCount = 0;
		for (const job of jobs) {
			if (
				job.status !== ImportJobStatus.QUEUED &&
				job.status !== ImportJobStatus.PROCESSING
			) {
				skippedCount++;
				continue;
			}

			this.requestCancelAcrossProcesses(job.id);
			const cancelledJob = await this.importJobsService.markCancelled(
				job.id,
				'Cancelled by user',
			);
			if (cancelledJob.status === ImportJobStatus.CANCELLED) {
				jobIds.push(job.id);
			} else {
				skippedCount++;
			}
		}

		return { cancelledCount: jobIds.length, jobIds, skippedCount };
	}

	async cancelExportJobs(
		jobIds: string[],
		tenantId: string,
	): Promise<AnalyticsReportExportCancelListResult> {
		const uniqueJobIds = Array.from(new Set(jobIds));
		const cancelledJobIds: string[] = [];
		let skippedCount = jobIds.length - uniqueJobIds.length;

		for (const jobId of uniqueJobIds) {
			try {
				const job = await this.getReadableExportJob(jobId, tenantId);
				if (
					job.status !== ImportJobStatus.QUEUED &&
					job.status !== ImportJobStatus.PROCESSING
				) {
					skippedCount++;
					continue;
				}

				this.requestCancelAcrossProcesses(job.id);
				const cancelledJob = await this.importJobsService.markCancelled(
					job.id,
					'Cancelled by user',
				);
				if (cancelledJob.status === ImportJobStatus.CANCELLED) {
					cancelledJobIds.push(job.id);
				} else {
					skippedCount++;
				}
			} catch (err) {
				if (err instanceof NotFoundException) {
					skippedCount++;
					continue;
				}
				throw err;
			}
		}

		return {
			cancelledCount: cancelledJobIds.length,
			jobIds: cancelledJobIds,
			skippedCount,
		};
	}

	/**
	 * Reaper cho job QUEUED bị mắc kẹt.
	 *
	 * `checkPendingTimeout` chỉ quét status PENDING nên job QUEUED mất khỏi Redis
	 * (worker ack im lặng, Redis flush, container chết giữa dequeue và markProcessing)
	 * sẽ đứng đó vĩnh viễn — đúng triệu chứng user báo.
	 *
	 * Job QUEUED quá ngưỡng mà KHÔNG còn trong Redis queue/processing = orphan
	 * → re-enqueue. Quá số lần cho phép → markFailed.
	 */
	@Cron('*/2 * * * *')
	async reapStuckQueuedJobs(): Promise<void> {
		if (process.env.APP_ROLE !== 'worker') return;

		const stuck = await this.findStuckQueuedExportJobs();
		if (!stuck.length) return;

		let requeued = 0;
		let failed = 0;

		for (const jobId of stuck) {
			// Còn trong Redis → worker sẽ xử lý, không can thiệp.
			if (await this.exportQueueService.isTracked(jobId)) continue;

			const attempts =
				await this.exportQueueService.incrementRequeueAttempt(jobId);
			if (attempts > this.maxRequeueAttempts) {
				try {
					await this.importJobsService.markFailed(
						jobId,
						`Stuck in QUEUED, re-enqueued ${attempts - 1} time(s) without progress`,
					);
					await this.exportQueueService.clearRequeueAttempts(jobId);
					failed++;
				} catch (err) {
					// Giữ counter để cron sau thử mark FAILED lại. Nếu xoá ở đây,
					// job vẫn QUEUED nhưng đã mất cả queue lẫn history retry.
					this.logger.error(
						`Failed to mark orphan QUEUED export job ${jobId} as FAILED: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
				continue;
			}

			this.logger.warn(
				`Orphan QUEUED export job ${jobId} not in Redis. Re-enqueueing (attempt ${attempts}).`,
			);
			await this.exportQueueService.enqueue(jobId);
			requeued++;
		}

		if (requeued > 0 || failed > 0) {
			this.logger.log(
				`Stuck QUEUED export reaper: requeued=${requeued}, failed=${failed}`,
			);
		}
	}

	/** Fail export jobs that were created but never reached the queue within one hour. */
	@Cron('*/2 * * * *')
	async failStuckPendingExportJobs(): Promise<void> {
		if (process.env.APP_ROLE !== 'worker') return;

		const sql = `
      SELECT id FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
      WHERE source_type = {sourceType:String}
        AND status = {status:String}
        AND created_at < now64(3) - toIntervalMinute({minutes:UInt16})
      ORDER BY created_at ASC
      LIMIT {limit:UInt32}
    `;
		const rows = await this.clickHouseService.query<{ id: string }>(sql, {
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
			status: ImportJobStatus.PENDING,
			minutes: this.pendingExportTimeoutMinutes,
			limit: this.cleanupBatchSize,
		});

		for (const { id } of rows) {
			try {
				await this.importJobsService.markFailed(
					id,
					`Export job remained PENDING for over ${this.pendingExportTimeoutMinutes} minutes`,
				);
				this.logger.warn(
					`Marked stale PENDING export job ${id} as FAILED`,
				);
			} catch (err) {
				this.logger.error(
					`Failed to mark stale PENDING export job ${id}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	/** Job export status QUEUED, tạo lâu hơn stuckQueuedMinutes. */
	private async findStuckQueuedExportJobs(): Promise<string[]> {
		const sql = `
      SELECT id FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
      WHERE source_type = {sourceType:String}
        AND status = {status:String}
        AND created_at < now64(3) - toIntervalMinute({minutes:UInt16})
      ORDER BY created_at ASC
      LIMIT {limit:UInt32}
    `;
		const rows = await this.clickHouseService.query<{ id: string }>(sql, {
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
			status: ImportJobStatus.QUEUED,
			minutes: this.stuckQueuedMinutes,
			limit: this.cleanupBatchSize,
		});
		return rows.map((r) => r.id);
	}

	// PLACEHOLDER_CLEANUP

	@Cron('0 3 * * *')
	async cleanupExpiredExportFiles(): Promise<void> {
		// Gate worker role: 2 container cùng chạy sẽ double-delete trên R2.
		if (process.env.APP_ROLE !== 'worker') return;

		const jobs = await this.findExpiredCompletedExportJobs();
		if (!jobs.length) return;

		let deletedCount = 0;
		let skippedCount = 0;
		for (const job of jobs) {
			const key =
				typeof job.result?.key === 'string' ? job.result.key : '';
			if (!key) {
				skippedCount++;
				continue;
			}

			try {
				await this.r2Service.deletePrivate(key);
			} catch (err) {
				if (!this.isR2NotFoundError(err)) {
					this.logger.warn(
						`Failed to delete expired analytics export file for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
					);
					skippedCount++;
					continue;
				}
			}

			await this.importJobsService.patchResult(job.id, {
				downloadUrl: null,
				bucketDeletedAt: new Date().toISOString(),
				bucketDeletedReason: `Expired after ${this.exportRetentionDays} days`,
			});
			deletedCount++;
		}

		if (deletedCount > 0 || skippedCount > 0) {
			this.logger.log(
				`Expired analytics export cleanup finished: deleted=${deletedCount}, skipped=${skippedCount}`,
			);
		}
	}

	private async findExpiredCompletedExportJobs(): Promise<ImportJob[]> {
		const sql = `
      SELECT id FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
      WHERE source_type = {sourceType:String}
        AND status = {status:String}
        AND result != ''
        AND JSONExtractString(result, 'key') != ''
        AND JSONExtractString(result, 'bucketDeletedAt') = ''
        AND coalesce(finished_at, created_at) < now64(3) - toIntervalDay({retentionDays:UInt16})
      ORDER BY finished_at ASC
      LIMIT {limit:UInt32}
    `;
		const rows = await this.clickHouseService.query<{ id: string }>(sql, {
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
			status: ImportJobStatus.COMPLETED,
			retentionDays: this.exportRetentionDays,
			limit: this.cleanupBatchSize,
		});
		const jobs: ImportJob[] = [];
		for (const row of rows) {
			const job = await this.importJobsService.findById(row.id);
			if (job) jobs.push(job);
		}
		return jobs;
	}

	private isR2NotFoundError(error: unknown): boolean {
		const err = error as {
			message?: string;
			statusCode?: number;
			$metadata?: { httpStatusCode?: number };
		};
		const statusCode = err.statusCode ?? err.$metadata?.httpStatusCode;
		const message = err.message?.toLowerCase() ?? '';
		return statusCode === 404 || message.includes('not found');
	}

	private async getReadableExportJob(jobId: string, tenantId: string) {
		// ClickHouse là nguồn sự thật (job chạy ở process khác), snapshot local chỉ
		// là fallback cho khoảng race ngay sau create khi row chưa visible qua FINAL.
		// Thứ tự này quan trọng: đảo lại sẽ đọc snapshot QUEUED cũ ở container `api`.
		const job =
			(await this.importJobsService.findById(jobId)) ??
			this.importJobsService.getSnapshot(jobId);
		if (
			!job ||
			job.sourceType !== ImportJobSourceType.ANALYTICS_REPORT_EXPORT
		) {
			throw new NotFoundException(`Export job not found: ${jobId}`);
		}
		if (!checkIsSystemTenant(tenantId) && job.tenantId !== tenantId) {
			throw new NotFoundException(`Export job not found: ${jobId}`);
		}
		return job;
	}

	private isTerminalStatus(status: ImportJobStatus): boolean {
		return (
			status === ImportJobStatus.COMPLETED ||
			status === ImportJobStatus.FAILED ||
			status === ImportJobStatus.CANCELLED
		);
	}

	private buildPlaceholderFileName(dto: AnalyticsReportExportDto): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		const now = new Date();
		const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
		return `workspace_analytics-report_${dto.fromDate}_${dto.endDate}_${timestamp}.zip`;
	}
}
