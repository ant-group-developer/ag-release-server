import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import {
	BadRequestException,
	Controller,
	Get,
	MessageEvent,
	NotFoundException,
	Param,
	Post,
	Body,
	Sse,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { concat, from, interval, merge, Observable, of } from 'rxjs';
import { map, switchMap, takeWhile } from 'rxjs/operators';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import {
	ImportJobSourceType,
	ImportJobStatus,
} from '../interfaces/import-job.interface';
import {
	ImportJobsService,
	computeProgressDetail,
} from '../services/import-jobs/import-jobs.service';
import { JobEventsGateway } from '../services/import-jobs/job-events.gateway';
import { StatementsImportService } from '../services/statements/statements-import.service';
import { StatementsResolverService } from '../services/statements/statements-resolver.service';

const STATEMENTS_R2_PREFIX = 'statements-uploads';

@ApiTags('ETL - Statements')
@Controller('etl/statements')
export class StatementsUploadController {
	constructor(
		private readonly resolverService: StatementsResolverService,
		private readonly importService: StatementsImportService,
		private readonly importJobsService: ImportJobsService,
		private readonly jobEvents: JobEventsGateway,
		private readonly r2Service: BucketR2Service,
	) {}

	// ─── Step 1: get presigned upload URL ────────────────────────────────────

	@Post('pre-upload')
	@SystemAdminOnly()
	@ApiOperation({
		summary: 'Get presigned URL to upload statements zip',
		description:
			'Returns a jobId and a presigned PUT URL. ' +
			'Client uploads the zip directly to R2 with Content-Type: application/zip and Content-Length header, ' +
			'then calls POST /etl/statements/jobs/:jobId/start.',
	})
	@ApiBody({
		schema: {
			type: 'object',
			required: ['filename'],
			properties: {
				filename: {
					type: 'string',
					example: 'statements_2026-07-08.zip',
					description: 'Name of the zip file (must end with .zip)',
				},
			},
		},
	})
	async preUpload(@Body() body: { filename: string }) {
		if (!body?.filename) throw new BadRequestException('filename is required');
		if (!body.filename.toLowerCase().endsWith('.zip'))
			throw new BadRequestException('filename must end with .zip');

		// Create job first so job.id is the canonical identifier
		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.STATEMENTS_UPLOAD,
			fileName: body.filename,
		});

		const r2Key = `${STATEMENTS_R2_PREFIX}/${job.id}/${body.filename}`;

		const uploadUrl = await this.r2Service.getSignedUrlUpload({
			key: r2Key,
			isPublic: false,
			contentType: 'application/zip',
		});

		return new ResponseSuccess({
			data: { jobId: job.id, r2Key, uploadUrl },
		});
	}

	// ─── Step 2: start import job ────────────────────────────────────────────

	@Post('jobs/:jobId/start')
	@SystemAdminOnly()
	@ApiOperation({
		summary: 'Start statements import after R2 upload',
		description:
			'Verifies zip exists in R2, then downloads, extracts, resolves, and imports. ' +
			'Poll status via GET /etl/statements/jobs/:jobId or stream via GET /etl/statements/jobs/:jobId/events.',
	})
	@ApiParam({ name: 'jobId', description: 'jobId returned by POST /pre-upload' })
	async startJob(@Param('jobId') jobId: string) {
		const job = await this.importJobsService.findById(jobId);
		if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
		if (job.sourceType !== ImportJobSourceType.STATEMENTS_UPLOAD)
			throw new BadRequestException('Invalid job type');
		if (
			job.status === ImportJobStatus.PROCESSING ||
			job.status === ImportJobStatus.QUEUED
		) {
			return new ResponseSuccess({ data: { jobId, status: job.status } });
		}

		const r2Key = `${STATEMENTS_R2_PREFIX}/${job.id}/${job.fileName}`;

		// Verify file actually exists in R2
		await this.r2Service.findOne({
			bucketName: this.r2Service['privateBucketName'],
			key: r2Key,
		});

		await this.importJobsService.markProcessing(jobId);

		// Fire-and-forget async job
		this.runImportJob(jobId, r2Key).catch(() => {/* markFailed handles it */});

		return new ResponseSuccess({ data: { jobId, status: 'PROCESSING' } });
	}

	// ─── Step 3: poll status ─────────────────────────────────────────────────

	@Get('jobs/:jobId')
	@SystemAdminOnly()
	@ApiOperation({ summary: 'Get statements import job status' })
	@ApiParam({ name: 'jobId', description: 'jobId returned by POST /pre-upload' })
	async getJobStatus(@Param('jobId') jobId: string) {
		const job = await this.importJobsService.findById(jobId);
		if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
		return new ResponseSuccess({ data: formatStatementsJob(job, computeProgressDetail) });
	}

	// ─── Step 3 alt: SSE stream ──────────────────────────────────────────────

	@SystemAdminOnly()
	@Sse('jobs/:jobId/events')
	@ApiOperation({
		summary: 'Stream statements import job progress via SSE',
		description:
			'Emits progress, completed, or failed events. Auto-closes when job finishes. ' +
			'Pass token in query param: ?token=xxx',
	})
	@ApiParam({ name: 'jobId' })
	streamJobEvents(@Param('jobId') jobId: string): Observable<MessageEvent> {
		const updates$ = this.jobEvents.subscribe(jobId).pipe(
			map((evt) => ({ type: evt.type, data: evt.data })),
		);

		const heartbeat$ = interval(20000).pipe(
			map(() => ({ type: 'heartbeat', data: {} })),
		);

		const initial$ = from(this.importJobsService.findById(jobId)).pipe(
			switchMap((job) => {
				if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

				const snapshotEvt: MessageEvent = {
					type: 'snapshot',
					data: formatStatementsJob(job, computeProgressDetail),
				};

				if (
					job.status === ImportJobStatus.COMPLETED ||
					job.status === ImportJobStatus.FAILED ||
					job.status === ImportJobStatus.CANCELLED
				) {
					return of(snapshotEvt);
				}

				return concat(of(snapshotEvt), updates$);
			}),
		);

		return merge(initial$, heartbeat$).pipe(
			takeWhile(
				(evt) =>
					evt.type !== 'completed' &&
					evt.type !== 'failed' &&
					evt.type !== 'cancelled',
				true,
			),
		);
	}

	// ─── Internal: async import runner ───────────────────────────────────────

	private async runImportJob(jobId: string, r2Key: string): Promise<void> {
		const tempDir = path.join(os.tmpdir(), `statements-${jobId}-${randomUUID()}`);
		fs.mkdirSync(tempDir, { recursive: true });

		try {
			// 1. Download zip from R2
			await this.importJobsService.updateProgress(
				jobId,
				{ progressLabel: 'Downloading from R2', progressCurrent: 1, progressTotal: 4 },
				true,
			);
			const stream = await this.r2Service.getObjectStream({
				bucketName: this.r2Service['privateBucketName'],
				key: r2Key,
			});
			const zipPath = path.join(tempDir, 'upload.zip');
			await pipeline(stream, createWriteStream(zipPath));

			// 2. Extract zip
			await this.importJobsService.updateProgress(
				jobId,
				{ progressLabel: 'Extracting zip', progressCurrent: 2, progressTotal: 4 },
				true,
			);
			const extractDir = path.join(tempDir, 'extracted');
			fs.mkdirSync(extractDir);
			new AdmZip(zipPath).extractAllTo(extractDir, true);
			fs.rmSync(zipPath);

			const allFiles = fs.readdirSync(extractDir);

			// 3. Resolve canonical files + dedup
			await this.importJobsService.updateProgress(
				jobId,
				{ progressLabel: 'Resolving canonical files', progressCurrent: 3, progressTotal: 4 },
				true,
			);
			const resolveResult = await this.resolverService.resolve(extractDir);

			// 4. Import
			await this.importJobsService.updateProgress(
				jobId,
				{
					progressLabel: `Importing ${resolveResult.toImport.length} files`,
					progressCurrent: 4,
					progressTotal: 4,
					totalRows: 0,
				},
				true,
			);

			const summary = await this.importService.import(resolveResult, {
				totalFilesInFolder: allFiles.length,
				onProgress: (label, current, total) => {
					this.importJobsService.updateProgress(jobId, {
						progressLabel: label,
						progressCurrent: current,
						progressTotal: total,
					});
				},
			});

			await this.importJobsService.markCompleted(jobId, {
				totalRows: summary.totalRowsImported,
				processedRows: summary.totalRowsImported,
				skippedRows: summary.totalFilesSkipped,
				// Summary block — shown in job result
				summary: {
					totalFilesInFolder: summary.totalFilesInFolder,
					totalFilesResolved: summary.totalFilesResolved,
					totalFilesToImport: summary.totalFilesToImport,
					totalFilesSkipped: summary.totalFilesSkipped,
					skippedByReason: summary.skippedByReason,
					totalRowsImported: summary.totalRowsImported,
					totalDurationMs: summary.totalDurationMs,
					batchId: summary.batchId,
					errors: summary.errors,
				},
				// Detail block — per DSP breakdown
				detail: {
					byDsp: summary.byDsp,
					skippedFiles: summary.skippedFiles,
				},
			});
		} catch (err) {
			await this.importJobsService.markFailed(jobId, err as Error);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
			// Clean up R2 upload
			try {
				await this.r2Service.deletePrivate(r2Key);
			} catch {
				// Non-fatal
			}
		}
	}
}

function formatStatementsJob(job: any, computeDetail: (j: any) => any) {
	return {
		id: job.id,
		status: job.status,
		progress: {
			current: job.status === ImportJobStatus.COMPLETED ? job.progressTotal : job.progressCurrent,
			total: job.progressTotal,
			label: job.status === ImportJobStatus.COMPLETED ? 'Done' : job.progressLabel,
			detail: computeDetail(job),
		},
		rows: {
			total: job.totalRows,
			processed: job.processedRows,
			skipped: job.skippedRows,
			errors: job.errorRows,
		},
		summary: job.result?.summary ?? null,
		detail: job.result?.detail ?? null,
		error: job.errorMessage || null,
		createdAt: job.createdAt,
		startedAt: job.startedAt,
		finishedAt: job.finishedAt,
		durationMs: job.durationMs,
	};
}
