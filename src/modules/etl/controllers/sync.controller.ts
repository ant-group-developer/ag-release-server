import { Body, Controller, Get, Post, Put, Query, Patch, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { SyncService } from '../services/sync/sync.service';
import { FtpService } from '../services/ftp/ftp.service';
import { ImportJobsService } from '../services/import-jobs/import-jobs.service';
import { ImportJobSourceType } from '../interfaces';
import { User } from '../../../common/decorators/req.decorators';
import { SchedulerService } from '../services/scheduler/scheduler.service';
import { UpdateSyncConfigDto } from '../dto/sync-config.dto';
import { ResponseSuccess } from '../../../common/dtos/common.response.dto';

@ApiTags('ETL')
@Controller('etl')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly ftpService: FtpService,
    private readonly importJobsService: ImportJobsService,
    private readonly schedulerService: SchedulerService,
  ) {}

  // ── FTP: Connection ───────────────────────────────────

  @Get('ftp/test')
  @ApiOperation({ summary: 'Test FTPS connection' })
  async testFtpConnection() {
    const result = await this.ftpService.testConnection();
    return new ResponseSuccess({ data: result });
  }

  @Get('ftp/periods')
  @ApiOperation({
    summary: 'List available periods on FTPS',
    description: 'Lists all YYYYMM folders found in trends/ and usage/ on the FTPS server',
  })
  async listFtpPeriods() {
    const result = await this.ftpService.listPeriods();
    return new ResponseSuccess({ data: result });
  }

  // ── FTP: Async Sync (returns job ID) ──────────────────

  @Post('ftp/sync')
  @ApiOperation({
    summary: 'Sync a range of periods from FTPS (async)',
    description: 'Starts download+import for a month range in background. Returns a jobId. Poll GET /etl/jobs/:id.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        month_start: { type: 'string', example: '202401', description: 'YYYYMM format' },
        month_end: { type: 'string', example: '202409', description: 'YYYYMM format' },
        force: { type: 'boolean', example: false, description: 'Force re-import even if already done' },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['trends', 'usage', 'sales', 'illegitimate_activity'],
          },
          description: 'Filter specific categories to sync',
          example: ['sales', 'trends'],
        },
      },
      required: ['month_start', 'month_end'],
    },
  })
  async syncPeriod(
    @Body() body: {
      month_start: string;
      month_end: string;
      force?: boolean;
      categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>;
    },
    @User() user: any,
  ) {
    const validatePeriod = (p: string) => {
      if (!p || !/^\d{6}$/.test(p)) return false;
      const month = parseInt(p.substring(4, 6), 10);
      return month >= 1 && month <= 12;
    };

    if (!validatePeriod(body.month_start) || !validatePeriod(body.month_end)) {
      throw new BadRequestException('month_start and month_end must be in YYYYMM format (e.g. 202401)');
    }

    if (parseInt(body.month_start, 10) > parseInt(body.month_end, 10)) {
      throw new BadRequestException('month_start must be less than or equal to month_end');
    }

    const periods = this.getPeriodsInRange(body.month_start, body.month_end);

    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.FTP_SYNC_PERIOD,
      params: {
        month_start: body.month_start,
        month_end: body.month_end,
        periods,
        force: body.force ?? false,
        categories: body.categories,
      },
      tenantId: user?.tenantId,
      createdBy: user?.sub,
      progressTotal: periods.length,
    });

    setImmediate(() =>
      this.runSyncRangeJob(
        job.id,
        periods,
        body.force ?? false,
        body.categories,
      ),
    );

    return new ResponseSuccess({
      data: {
        jobId: job.id,
        statusUrl: `/etl/jobs/${job.id}`,
        message: `Sync started for range ${body.month_start} - ${body.month_end} (${periods.length} periods). Poll GET /etl/jobs/${job.id} for status.`,
      },
    });
  }

  @Post('ftp/retry')
  @ApiOperation({
    summary: 'Retry a failed import (async)',
    description: 'Re-downloads and re-imports a specific period that previously failed',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        period: { type: 'string', example: '202401' },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['trends', 'usage', 'sales', 'illegitimate_activity'],
          },
          description: 'Filter specific categories to sync',
          example: ['sales', 'trends'],
        },
      },
      required: ['period'],
    },
  })
  async retryImport(
    @Body() body: {
      period: string;
      categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>;
    },
    @User() user: any,
  ) {
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.FTP_RETRY,
      params: { period: body.period, force: true, categories: body.categories },
      tenantId: user?.tenantId,
      createdBy: user?.sub,
      progressTotal: 1,
    });

    setImmediate(() =>
      this.runSyncPeriodJob(job.id, body.period, true, body.categories),
    );

    return new ResponseSuccess({
      data: {
        jobId: job.id,
        statusUrl: `/etl/jobs/${job.id}`,
        message: `Retry started for period ${body.period}. Poll GET /etl/jobs/${job.id} for status.`,
      },
    });
  }

  // ── FTP: Status & History ─────────────────────────────

  @Get('ftp/status')
  @ApiOperation({
    summary: 'Get sync status',
    description: 'Shows which periods/DSP folders are imported, pending, or errored',
  })
  async getStatus() {
    const result = await this.syncService.getStatus();
    return new ResponseSuccess({ data: result });
  }

  @Get('ftp/history')
  @ApiOperation({
    summary: 'Get import history',
    description: 'Shows import tracking records from etl_import_history',
  })
  @ApiQuery({ name: 'period', required: false, description: 'Filter by period (YYYYMM)' })
  async getHistory(@Query('period') period?: string) {
    const result = await this.syncService.getImportHistory(period);
    return new ResponseSuccess({ data: result });
  }

  // ── Sync Config ───────────────────────────────────────

  @Get('sync-config')
  @ApiOperation({ summary: 'Get current sync configuration' })
  async getSyncConfig() {
    const result = await this.syncService.getSyncConfig();
    return new ResponseSuccess({ data: result });
  }

  @Put('sync-config')
  @ApiOperation({ summary: 'Update sync configuration' })
  async setSyncConfig(@Body() body: UpdateSyncConfigDto) {
    const updatedConfig = await this.syncService.setSyncConfig(body);
    if (body.cron) {
      await this.schedulerService.rescheduleAutoSync(body.cron);
    }
    return new ResponseSuccess({ data: updatedConfig });
  }

  @Patch('sync-config')
  @ApiOperation({ summary: 'Patch sync configuration' })
  async patchSyncConfig(@Body() body: UpdateSyncConfigDto) {
    const updatedConfig = await this.syncService.setSyncConfig(body);
    if (body.cron) {
      await this.schedulerService.rescheduleAutoSync(body.cron);
    }
    return new ResponseSuccess({ data: updatedConfig });
  }

  // ─────────────────────────────────────────────────────
  // Job runners — chạy nền, không throw ra ngoài
  // ─────────────────────────────────────────────────────

  private async runSyncPeriodJob(
    jobId: string,
    period: string,
    force: boolean,
    categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>,
  ): Promise<void> {
    try {
      await this.importJobsService.markProcessing(jobId);
      await this.importJobsService.updateProgress(
        jobId,
        { progressTotal: 1, progressCurrent: 0, progressLabel: `Syncing ${period}` },
        true,
      );
      const result = await this.syncService.syncPeriod(period, force, categories);
      await this.importJobsService.updateProgress(
        jobId,
        { progressTotal: 1, progressCurrent: 1, progressLabel: 'Done' },
        true,
      );
      await this.importJobsService.markCompleted(jobId, result as unknown as Record<string, unknown>);
    } catch (err) {
      await this.importJobsService.markFailed(jobId, err);
    }
  }

  private async runSyncRangeJob(
    jobId: string,
    periods: string[],
    force: boolean,
    categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>,
  ): Promise<void> {
    try {
      await this.importJobsService.markProcessing(jobId);
      await this.importJobsService.updateProgress(
        jobId,
        {
          progressTotal: periods.length,
          progressCurrent: 0,
          progressLabel: `Starting sync for ${periods.length} period(s)...`,
        },
        true,
      );

      const results: unknown[] = [];
      let totalRows = 0;
      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        await this.importJobsService.updateProgress(
          jobId,
          { progressCurrent: i, progressLabel: `Syncing ${period} (${i + 1}/${periods.length})...` },
          true,
        );
        try {
          const result = await this.syncService.syncPeriod(period, force, categories);
          results.push(result);
          if (result && typeof (result as any).totalRows === 'number') {
            totalRows += (result as any).totalRows;
          }
        } catch (err) {
          results.push({ period, error: err.message });
        }
      }

      await this.importJobsService.updateProgress(
        jobId,
        { progressCurrent: periods.length, progressLabel: 'Done' },
        true,
      );
      await this.importJobsService.markCompleted(jobId, {
        totalPeriods: periods.length,
        totalRows,
        results,
      });
    } catch (err) {
      await this.importJobsService.markFailed(jobId, err);
    }
  }

  private getPeriodsInRange(start: string, end: string): string[] {
    const periods: string[] = [];
    let currentYear = parseInt(start.substring(0, 4), 10);
    let currentMonth = parseInt(start.substring(4, 6), 10);
    const endYear = parseInt(end.substring(0, 4), 10);
    const endMonth = parseInt(end.substring(4, 6), 10);

    while (
      currentYear < endYear ||
      (currentYear === endYear && currentMonth <= endMonth)
    ) {
      const monthStr = currentMonth.toString().padStart(2, '0');
      periods.push(`${currentYear}${monthStr}`);

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
    return periods;
  }
}
