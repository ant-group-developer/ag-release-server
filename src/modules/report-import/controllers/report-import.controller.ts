import {
  Body,
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Sse,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { concat, from, interval, merge, Observable, of } from 'rxjs';
import { map, switchMap, takeWhile } from 'rxjs/operators';
import { ReportImportService } from '../services/report-import.service';
import {
  DeleteImportedReleasesDto,
  PreValidateRequestDto,
  ReportImportStartResponseDto,
  ReportImportStatusResponseDto,
} from '../dto/report-import.dto';
import { UpdateSpotifyR2SyncConfigDto } from '../dto/spotify-r2-sync-config.dto';
import { UpdateSpotifyExportSchedulerConfigDto } from '../dto/spotify-export-scheduler-config.dto';
import { TriggerSpotifyExportDto } from '../dto/spotify-export-tool.dto';
import { SpotifyExportToolService } from '../services/spotify-export-tool.service';
import { SpotifyExportSchedulerService } from '../services/spotify-export-scheduler.service';
import { User } from '../../../common/decorators/req.decorators';
import { ResponseSuccess } from '../../../common/dtos/common.response.dto';
import { SystemAdminOnly } from '../../auth/decorators/auth.decorator';
import { ImportJob } from '../../etl/interfaces';
import {
	computeProgressDetail,
	ImportJobsService,
} from '../../etl/services/import-jobs/import-jobs.service';
import { JobEventsGateway } from '../../etl/services/import-jobs/job-events.gateway';
import {
	ReportImportPreValidateResponse,
	ReportImportStartResponse,
	ReportImportStatusResponse,
} from '../interfaces/report-import.interface';
import { ImportedReleaseDeleteService } from '../services/imported-release-delete.service';
import { SpotifyR2SyncService } from '../services/spotify-r2-sync.service';
@ApiTags('Report Import')
@Controller('report-import')
export class ReportImportController {
  constructor(
    private readonly reportImportService: ReportImportService,
    private readonly importJobsService: ImportJobsService,
    private readonly importedReleaseDeleteService: ImportedReleaseDeleteService,
    private readonly jobEvents: JobEventsGateway,
    private readonly spotifyR2SyncService: SpotifyR2SyncService,
    private readonly spotifyExportToolService: SpotifyExportToolService,
    private readonly spotifyExportSchedulerService: SpotifyExportSchedulerService,
  ) {}

	@SystemAdminOnly()
	@Post('pre-validate')
	@ApiOperation({
		summary:
			'Pre-validate file paths and retrieve R2 presigned upload URLs',
		description:
			'Verifies files match regex rules and returns R2 upload URLs.',
	})
	async preValidate(
		@Body() body: PreValidateRequestDto,
		@User() user: any,
	): Promise<ResponseSuccess<ReportImportPreValidateResponse>> {
		const result = await this.reportImportService.preValidate(
			body.files,
			body.tenantId || user?.tenantId,
			user?.sub,
			body.allowedExtensions,
			body.labelId,
		);
		return new ResponseSuccess({
			data: result,
		});
	}

	@SystemAdminOnly()
	@Post('jobs/:jobId/start')
	@ApiOperation({
		summary: 'Trigger job processing after uploading files to R2',
		description:
			'Enqueues the validated upload job to Redis for background execution.',
	})
	@ApiParam({
		name: 'jobId',
		description: 'ID of the pre-validated import job',
	})
	async startJob(
		@Param('jobId') jobId: string,
	): Promise<ResponseSuccess<ReportImportStartResponse>> {
		const job = await this.reportImportService.startJob(jobId);
		return new ResponseSuccess({
			data: new ReportImportStartResponseDto(job),
		});
	}

	@SystemAdminOnly()
	@Get('jobs/:jobId/status')
	@ApiOperation({
		summary: 'Get status of a report import job',
		description: 'Poll this endpoint to track upload import progress.',
	})
	@ApiParam({ name: 'jobId', description: 'ID of the import job' })
	async getJobStatus(
		@Param('jobId') jobId: string,
	): Promise<ResponseSuccess<ReportImportStatusResponse>> {
		const job = await this.importJobsService.findById(jobId);
		if (!job) {
			throw new NotFoundException(`Không tìm thấy Job ID: ${jobId}`);
		}
		return new ResponseSuccess({
			data: new ReportImportStatusResponseDto(job),
		});
	}

	@SystemAdminOnly()
	@Post('releases/delete')
	@UseInterceptors(AnyFilesInterceptor())
	@ApiConsumes('multipart/form-data')
	@ApiOperation({
		summary: 'Delete imported releases from PostgreSQL',
		description:
			'Hard deletes releases where is_imported_from_report=true. At least one filter is required unless deleteAll=true.',
	})
	async deleteImportedReleases(
		@User() user: any,
		@Body() body: DeleteImportedReleasesDto,
	): Promise<ResponseSuccess<any>> {
		const result = await this.importedReleaseDeleteService.createDeleteJob(
			body,
			user?.sub,
		);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Sse('releases/delete/:jobId/events')
	@ApiOperation({
		summary: 'Stream imported release delete progress via SSE',
		description:
			'Client listens here after POST /report-import/releases/delete. Auto-closes on completed or failed status.',
	})
	@ApiParam({ name: 'jobId', description: 'Delete job ID' })
	streamDeleteEvents(
		@Param('jobId') jobId: string,
	): Observable<MessageEvent> {
		const updates$ = this.jobEvents.subscribe(jobId).pipe(
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

		const initial$ = from(this.importJobsService.findById(jobId)).pipe(
			switchMap((job) => {
				if (!job) {
					throw new NotFoundException(
						`Delete job not found: ${jobId}`,
					);
				}

				const snapshotEvt: MessageEvent = {
					type: 'snapshot',
					data: formatReportImportJob(job),
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

  @SystemAdminOnly()
  @Get('spotify/r2-sync-config')
  @ApiOperation({
    summary: 'Get Spotify R2 auto-sync config',
    description: 'Returns enabled/cron/prefix, backed by etl_config in ClickHouse.',
  })
  async getSpotifyR2SyncConfig(): Promise<ResponseSuccess<any>> {
    return new ResponseSuccess({
      data: await this.spotifyR2SyncService.getConfig(),
    });
  }

  @SystemAdminOnly()
  @Put('spotify/r2-sync-config')
  @Patch('spotify/r2-sync-config')
  @ApiOperation({
    summary: 'Update Spotify R2 auto-sync config',
    description: 'Updates enabled/cron/prefix. Reschedules the cron job immediately if cron changes.',
  })
  async setSpotifyR2SyncConfig(
    @Body() body: UpdateSpotifyR2SyncConfigDto,
  ): Promise<ResponseSuccess<any>> {
    const updated = await this.spotifyR2SyncService.setConfig(body);
    if (body.cron) {
      await this.spotifyR2SyncService.rescheduleCron(body.cron);
    }
    return new ResponseSuccess({ data: updated });
  }

  @SystemAdminOnly()
  @Post('spotify/sync-r2')
  @ApiOperation({
    summary: 'Trigger Spotify R2 sync now',
    description:
      'Returns immediately with a jobId and runs the scan/extract/import in the background ' +
      '(avoids HTTP timeout on large zips). Poll GET /report-import/jobs/:jobId/status for progress and result.',
  })
  async triggerSpotifyR2Sync(): Promise<ResponseSuccess<ReportImportStartResponseDto>> {
    const job = await this.spotifyR2SyncService.triggerManualSync();
    return new ResponseSuccess({ data: new ReportImportStartResponseDto(job) });
  }

  @SystemAdminOnly()
  @Post('spotify/export-trigger')
  @ApiOperation({
    summary: 'Trigger Box -> R2 export on ag-release-tool-export',
    description:
      'Gọi sang ag-release-tool-export (POST /api/spotify/sync) để đăng nhập Box.com, tải toàn bộ folder con và upload zip đã chuẩn hoá lên R2 (spotify-reports/). ' +
      'Trả về ngay jobId nội bộ, tự poll jobSpoId phía ag-release-tool-export tới khi xong. ' +
      'Poll GET /report-import/jobs/:jobId/status (hoặc GET /etl/jobs/:jobId) để theo dõi. ' +
      'Sau khi job COMPLETED, cron riêng của service này (spotify-r2-auto-sync) sẽ tự phát hiện file mới trên R2 và import, không cần gọi thêm gì.',
  })
  async triggerSpotifyExport(
    @Body() body: TriggerSpotifyExportDto,
  ): Promise<ResponseSuccess<ReportImportStartResponseDto>> {
    const job = await this.spotifyExportToolService.triggerExport(body);
    return new ResponseSuccess({ data: new ReportImportStartResponseDto(job) });
  }

  @SystemAdminOnly()
  @Post('spotify/cleanup-processed')
  @ApiOperation({
    summary: 'Delete expired zips from spotify-reports/processed/ now',
    description:
      'Runs the same retention cleanup as the daily cron immediately, based on the configured retentionDays. ' +
      'Runs synchronously (fast, just a list + delete of already-processed zips).',
  })
  async cleanupSpotifyProcessed(): Promise<ResponseSuccess<{ deleted: number }>> {
    const config = await this.spotifyR2SyncService.getConfig();
    const result = await this.spotifyR2SyncService.cleanupProcessedZips(config.prefix, config.retentionDays);
    return new ResponseSuccess({ data: result });
  }

  @SystemAdminOnly()
  @Get('spotify/export-scheduler-config')
  @ApiOperation({
    summary: 'Get Spotify export auto-trigger scheduler config',
    description: 'Returns enabled/cron cho scheduler tự động gọi CI tool (Box -> R2), backed by etl_config.',
  })
  async getSpotifyExportSchedulerConfig(): Promise<ResponseSuccess<any>> {
    return new ResponseSuccess({
      data: await this.spotifyExportSchedulerService.getConfig(),
    });
  }

  @SystemAdminOnly()
  @Put('spotify/export-scheduler-config')
  @Patch('spotify/export-scheduler-config')
  @ApiOperation({
    summary: 'Update Spotify export auto-trigger scheduler config',
    description: 'Updates enabled/cron. Reschedules cron job ngay nếu cron thay đổi.',
  })
  async setSpotifyExportSchedulerConfig(
    @Body() body: UpdateSpotifyExportSchedulerConfigDto,
  ): Promise<ResponseSuccess<any>> {
    const updated = await this.spotifyExportSchedulerService.setConfig(body);
    if (body.cron) {
      await this.spotifyExportSchedulerService.rescheduleCron(body.cron);
    }
    return new ResponseSuccess({ data: updated });
  }
}

function formatReportImportJob(job: ImportJob) {
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
		file: job.fileName
			? {
					name: job.fileName,
					sizeBytes: job.fileSizeBytes,
					hash: job.fileHash || null,
				}
			: null,
		params: job.params,
		result: job.result,
		error: job.errorMessage || null,
		batchId: job.batchId || null,
		tenantId: job.tenantId || null,
		createdBy: job.createdBy || null,
		createdAt: job.createdAt,
		startedAt: job.startedAt,
		finishedAt: job.finishedAt,
		durationMs: job.durationMs,
	};
}
