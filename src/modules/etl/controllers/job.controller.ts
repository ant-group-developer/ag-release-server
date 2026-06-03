import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ImportJobsService } from '../services/import-jobs/import-jobs.service';
import { ImportJob, ImportJobSourceType, ImportJobStatus } from '../interfaces';

@ApiTags('ETL')
@Controller('etl')
export class JobController {
  constructor(private readonly importJobsService: ImportJobsService) {}

  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Get import/sync job status by ID',
    description:
      'Poll this endpoint to track progress. Status: PENDING → PROCESSING → COMPLETED | FAILED | CANCELLED. ' +
      'Job được lưu trong ClickHouse `import_jobs` (ReplacingMergeTree).',
  })
  @ApiParam({ name: 'id', description: 'Job ID returned by /etl/import/wmg or /etl/ftp/sync*' })
  async getJobStatus(@Param('id') id: string) {
    const job = await this.importJobsService.findById(id);
    if (!job) return { error: 'Job not found', id };
    return formatJob(job);
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List recent import/sync jobs',
    description: 'Filter by status / sourceType / tenantId. Sorted by createdAt DESC.',
  })
  @ApiQuery({ name: 'status', required: false, enum: Object.values(ImportJobStatus) })
  @ApiQuery({ name: 'sourceType', required: false, enum: Object.values(ImportJobSourceType) })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  async listJobs(
    @Query('status') status?: ImportJobStatus,
    @Query('sourceType') sourceType?: ImportJobSourceType,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.importJobsService.list({
      status,
      sourceType,
      tenantId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return {
      items: result.items.map(formatJob),
      limit: result.limit,
      offset: result.offset,
    };
  }
}

function formatJob(job: ImportJob) {
  return {
    id: job.id,
    sourceType: job.sourceType,
    status: job.status,
    progress: {
      current: job.progressCurrent,
      total: job.progressTotal,
      label: job.progressLabel,
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
