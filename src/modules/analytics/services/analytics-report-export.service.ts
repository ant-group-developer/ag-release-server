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

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly r2Service: BucketR2Service,
		private readonly importJobsService: ImportJobsService,
		private readonly exportQueueService: ExportQueueService,
		private readonly workerPool: ExportWorkerPoolService,
	) {}

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
			progressTotal: 4,
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

		this.workerPool.requestCancel(job.id);
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

			this.workerPool.requestCancel(job.id);
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

				this.workerPool.requestCancel(job.id);
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

	// PLACEHOLDER_CLEANUP

	@Cron('0 3 * * *')
	async cleanupExpiredExportFiles(): Promise<void> {
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
		const job =
			this.importJobsService.getSnapshot(jobId) ??
			(await this.importJobsService.findById(jobId));
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
