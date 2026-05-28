import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { JobService } from '../services/job/job.service';

@ApiTags('ETL')
@Controller('etl')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Get job status by ID',
    description: 'Poll this endpoint to track sync progress. Status: pending → running → done | error',
  })
  @ApiParam({ name: 'id', description: 'Job ID returned by sync/sync-all/retry' })
  async getJobStatus(@Param('id') id: string) {
    const job = this.jobService.getJob(id);
    if (!job) {
      return { error: 'Job not found', id };
    }

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      params: job.params,
      result: job.status === 'done' ? job.result : undefined,
      error: job.error || undefined,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.completedAt && job.startedAt
        ? job.completedAt.getTime() - job.startedAt.getTime()
        : job.startedAt
          ? Date.now() - job.startedAt.getTime()
          : undefined,
    };
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List all recent jobs',
    description: 'Returns last 50 jobs sorted by most recent',
  })
  async listJobs() {
    return this.jobService.getAllJobs().map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      params: job.params,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    }));
  }
}
