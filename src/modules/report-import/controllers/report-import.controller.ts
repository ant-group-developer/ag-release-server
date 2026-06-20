import {
  Body,
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Sse,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { concat, from, interval, merge, Observable, of } from 'rxjs';
import { map, switchMap, takeWhile } from 'rxjs/operators';
import { ReportImportService } from '../services/report-import.service';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import {
  DeleteImportedReleasesDto,
  PreValidateRequestDto,
  ReportImportStartResponseDto,
  ReportImportStatusResponseDto,
} from '../dto/report-import.dto';
import { User } from '../../../common/decorators/req.decorators';
import { ResponseSuccess } from '../../../common/dtos/common.response.dto';
import { SystemAdminOnly } from '../../auth/decorators/auth.decorator';
import {
  ReportImportPreValidateResponse,
  ReportImportStartResponse,
  ReportImportStatusResponse,
} from '../interfaces/report-import.interface';
import { ImportedReleaseDeleteService } from '../services/imported-release-delete.service';
import { JobEventsGateway } from '../../etl/services/import-jobs/job-events.gateway';
import { ImportJob } from '../../etl/interfaces';
import { computeProgressDetail } from '../../etl/services/import-jobs/import-jobs.service';

@ApiTags('Report Import')
@Controller('report-import')
export class ReportImportController {
  constructor(
    private readonly reportImportService: ReportImportService,
    private readonly importJobsService: ImportJobsService,
    private readonly importedReleaseDeleteService: ImportedReleaseDeleteService,
    private readonly jobEvents: JobEventsGateway,
  ) {}

  @SystemAdminOnly()
  @Post('pre-validate')
  @ApiOperation({
    summary: 'Pre-validate file paths and retrieve R2 presigned upload URLs',
    description: 'Verifies files match regex rules and returns R2 upload URLs.',
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
    description: 'Enqueues the validated upload job to Redis for background execution.',
  })
  @ApiParam({ name: 'jobId', description: 'ID of the pre-validated import job' })
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
    const result =
      await this.importedReleaseDeleteService.createDeleteJob(body, user?.sub);
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
  streamDeleteEvents(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const updates$ = this.jobEvents.subscribe(jobId).pipe(
      map((evt) => ({
        type: evt.type,
        data: evt.data,
      } as MessageEvent)),
    );

    const heartbeat$ = interval(20000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: {},
      } as MessageEvent)),
    );

    const initial$ = from(this.importJobsService.findById(jobId)).pipe(
      switchMap((job) => {
        if (!job) {
          throw new NotFoundException(`Delete job not found: ${jobId}`);
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
}

function formatReportImportJob(job: ImportJob) {
  return {
    id: job.id,
    sourceType: job.sourceType,
    status: job.status,
    progress: {
      current: job.status === 'COMPLETED' ? job.progressTotal : job.progressCurrent,
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
      ? { name: job.fileName, sizeBytes: job.fileSizeBytes, hash: job.fileHash || null }
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
