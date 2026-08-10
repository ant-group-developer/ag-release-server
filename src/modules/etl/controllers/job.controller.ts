import {
	Controller,
	Get,
	MessageEvent,
	NotFoundException,
	Param,
	Post,
	Query,
	Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Observable, concat, from, interval, merge, of } from 'rxjs';
import { map, switchMap, takeWhile } from 'rxjs/operators';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { QueryGetListJobsDto } from '../dto/job-query.dto';
import { ImportJob, ImportJobSourceType } from '../interfaces';
import { EtlImportHistoryRepository } from '../services/etl-import-history/etl-import-history.repository';
import {
	ImportJobsService,
	computeProgressDetail,
} from '../services/import-jobs/import-jobs.service';
import { JobEventsGateway } from '../services/import-jobs/job-events.gateway';

@ApiTags('ETL')
@Controller('etl')
export class JobController {
	constructor(
		private readonly importJobsService: ImportJobsService,
		private readonly jobEvents: JobEventsGateway,
		private readonly etlImportHistoryRepository: EtlImportHistoryRepository,
	) {}

	@Get('jobs/:id/status-detail')
	@ApiOperation({
		summary: 'Get per-file import detail for a job',
		description:
			'Returns etl_import_history records grouped by period → category → dsp_folder → files[]',
	})
	@ApiParam({ name: 'id', description: 'Job ID' })
	async getJobStatusDetail(
		@Param('id') id: string,
	): Promise<ResponseSuccess<any>> {
		const rows = await this.etlImportHistoryRepository.findByJobId(id);
		const grouped: Record<
			string,
			Record<string, Record<string, any[]>>
		> = {};

		for (const row of rows) {
			const period = row.period || '_';
			const category = row.category || '_';
			const dspFolder = row.dsp_folder || '_';

			if (!grouped[period]) grouped[period] = {};
			if (!grouped[period][category]) grouped[period][category] = {};
			if (!grouped[period][category][dspFolder])
				grouped[period][category][dspFolder] = [];

			grouped[period][category][dspFolder].push({
				fileName: row.file_name,
				filePath: row.file_path,
				status: row.status,
				fileSizeBytes: Number(row.file_size_bytes ?? 0),
				totalLines: Number(row.total_lines),
				processedRows: Number(row.processed_rows),
				skippedRows: Number(row.skipped_rows),
				errorRows: Number(row.error_rows),
				durationMs: Number(row.duration_ms),
				errorMessage: row.error_message || null,
				startedAt: row.started_at,
				completedAt: row.completed_at,
			});
		}

		return new ResponseSuccess({ data: grouped });
	}

	@Get('jobs/:id')
	@ApiOperation({
		summary: 'Get import/sync job status by ID',
		description:
			'Poll this endpoint to track progress. Status: PENDING → PROCESSING → COMPLETED | FAILED | CANCELLED. ' +
			'Job được lưu trong ClickHouse `import_jobs` (ReplacingMergeTree).',
	})
	@ApiParam({
		name: 'id',
		description: 'Job ID returned by /etl/import/wmg or /etl/ftp/sync*',
	})
	async getJobStatus(@Param('id') id: string): Promise<ResponseSuccess<any>> {
		const job = await this.importJobsService.findById(id);
		if (!job) {
			throw new NotFoundException(`Job not found: ${id}`);
		}
		const result = formatJob(job);
		return new ResponseSuccess({
			data: result,
		});
	}

	@SystemAdminOnly()
	@Sse('jobs/:id/events')
	@ApiOperation({
		summary: 'Stream job progress/status via Server-Sent Events',
		description:
			'Auto-closes on completed or failed status. Pass token in query param: ?token=xxx',
	})
	@ApiParam({ name: 'id', description: 'Job ID to stream status for' })
	streamJobEvents(@Param('id') id: string): Observable<MessageEvent> {
		const updates$ = this.jobEvents.subscribe(id).pipe(
			map((evt) => ({
				type: evt.type,
				data: evt.data,
			})),
		);

		const heartbeat$ = interval(20000).pipe(
			map(() => ({
				type: 'heartbeat',
				data: {},
			})),
		);

		const initial$ = from(this.importJobsService.findById(id)).pipe(
			switchMap((job) => {
				if (!job) {
					throw new NotFoundException(`Job not found: ${id}`);
				}

				const snapshotEvt: MessageEvent = {
					type: 'snapshot',
					data: formatJob(job),
				};

				if (
					job.status === 'COMPLETED' ||
					job.status === 'FAILED' ||
					job.status === 'CANCELLED'
				) {
					return of(snapshotEvt);
				}

				return concat(of(snapshotEvt), updates$);
			}),
		);

		return merge(initial$, heartbeat$).pipe(
			takeWhile((evt) => {
				return (
					evt.type !== 'completed' &&
					evt.type !== 'failed' &&
					evt.type !== 'cancelled'
				);
			}, true),
		);
	}
	@Get('jobs')
	@ApiOperation({
		summary: 'List recent import/sync jobs',
		description:
			'Filter by status / sourceType / tenantId. Sorted by createdAt DESC.',
	})
	async listJobs(
		@Query() query: QueryGetListJobsDto,
	): Promise<ResponseSuccess<PageDto<any>>> {
		const {
			status,
			sourceType,
			tenantId,
			page,
			pageSize,
			fieldOrder,
			orderBy,
		} = query;
		const result = await this.importJobsService.list({
			status,
			sourceType,
			tenantId,
			limit: pageSize,
			offset: (page - 1) * pageSize,
			fieldOrder,
			orderBy: orderBy,
		});
		return new ResponseSuccess({
			data: new PageDto({
				items: result.items.map(formatJob),
				metadata: {
					page,
					pageSize,
					totalItems: result.totalItems,
				},
			}),
		});
	}

	@Post('jobs/backfill')
	@ApiOperation({
		summary: 'Backfill row counts from result JSON for all completed jobs',
		description:
			'Scans ClickHouse for completed jobs with 0 rows and extracts total_rows/processed_rows from result.',
	})
	async backfillJobs(): Promise<ResponseSuccess<{ updatedCount: number }>> {
		const result =
			await this.importJobsService.backfillRowCountsFromResults();
		return new ResponseSuccess({ data: result });
	}
}

function formatJob(job: ImportJob) {
	const isImportOrSync =
		job.sourceType === ImportJobSourceType.REPORT_UPLOAD ||
		job.sourceType === ImportJobSourceType.FTP_SYNC_PERIOD ||
		job.sourceType === ImportJobSourceType.FTP_SYNC_ALL ||
		job.sourceType === ImportJobSourceType.FTP_RETRY ||
		job.sourceType === ImportJobSourceType.FTP_AUTO_CRON;

	const isR2Sync = job.sourceType === ImportJobSourceType.SPOTIFY_R2_SYNC;
	const isExportTrigger =
		job.sourceType === ImportJobSourceType.SPOTIFY_EXPORT_TRIGGER;

	return {
		id: job.id,
		sourceType: job.sourceType,
		status: job.status,
		progress: {
			current:
				job.status === 'COMPLETED'
					? job.progressTotal
					: job.progressCurrent,
			total: job.progressTotal,
			label: job.status === 'COMPLETED' ? 'Done' : job.progressLabel,
			detail: computeProgressDetail(job),
		},
		rows: {
			total: job.totalRows,
			processed: job.processedRows,
			skipped: job.skippedRows,
			errors: job.errorRows,
		},
		releases:
			isImportOrSync && job.result && job.result.releases
				? job.result.releases
				: null,
		file: job.fileName
			? {
					name: job.fileName,
					sizeBytes: job.fileSizeBytes,
					hash: job.fileHash || null,
				}
			: null,
		params: job.params,
		...(isR2Sync
			? {
					detailR2Sync: job.result
						? {
								zipsFound: job.result.zipsFound ?? 0,
								zipsImported: job.result.zipsImported ?? 0,
								zipsSkipped: job.result.zipsSkipped ?? 0,
							}
						: null,
				}
			: isExportTrigger
				? {
						detailExport: job.result
							? {
									jobSpoId: job.result.jobSpoId ?? null,
									foldersUploaded:
										job.result.foldersUploaded ?? 0,
									r2ObjectKeys: job.result.r2ObjectKeys ?? [],
								}
							: null,
					}
				: { result: job.result }),
		error: job.errorMessage || null,
		batchId: job.batchId || null,
		tenantId: job.tenantId || null,
		createdBy: job.createdBy || null,
		createdAt: toVN(job.createdAt),
		startedAt: toVN(job.startedAt),
		finishedAt: toVN(job.finishedAt),
		durationMs: job.durationMs,
	};
}

/**
 * Convert ClickHouse DateTime64 string (UTC) to Vietnam timezone (UTC+7) ISO string.
 * Input format:  "2026-06-11 07:28:00.000" (UTC)
 * Output format: "2026-06-11T14:28:00.000+07:00"
 */
function toVN(dt: string | null): string | null {
	if (!dt) return null;
	try {
		const utc = new Date(dt.replace(' ', 'T') + 'Z');
		if (isNaN(utc.getTime())) return dt;
		// Shift +7 hours for display
		const vn = new Date(utc.getTime() + 7 * 60 * 60 * 1000);
		const pad = (n: number) => String(n).padStart(2, '0');
		const ms = String(vn.getUTCMilliseconds()).padStart(3, '0');
		return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}T${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:${pad(vn.getUTCSeconds())}.${ms}+07:00`;
	} catch {
		return dt;
	}
}
