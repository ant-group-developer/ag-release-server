import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { SyncService } from '../services/sync/sync.service';
import { FtpService } from '../services/ftp/ftp.service';
import { ImportJobsService } from '../services/import-jobs/import-jobs.service';
import { ImportJobSourceType } from '../interfaces';
import { User } from '../../../common/decorators/req.decorators';

@ApiTags('ETL')
@Controller('etl')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly ftpService: FtpService,
    private readonly importJobsService: ImportJobsService,
  ) {}

  // ── FTP: Connection ───────────────────────────────────

  @Get('ftp/test')
  @ApiOperation({ summary: 'Test FTPS connection' })
  async testFtpConnection() {
    return this.ftpService.testConnection();
  }

  @Get('ftp/periods')
  @ApiOperation({
    summary: 'List available periods on FTPS',
    description: 'Lists all YYYYMM folders found in trends/ and usage/ on the FTPS server',
  })
  async listFtpPeriods() {
    return this.ftpService.listPeriods();
  }

  // ── FTP: Async Sync (returns job ID) ──────────────────

  @Post('ftp/sync')
  @ApiOperation({
    summary: 'Sync a specific period from FTPS (async)',
    description: 'Starts download+import in background. Returns a jobId. Poll GET /etl/jobs/:id.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        period: { type: 'string', example: '202401', description: 'YYYYMM format' },
        force: { type: 'boolean', example: false, description: 'Force re-import even if already done' },
      },
      required: ['period'],
    },
  })
  async syncPeriod(
    @Body() body: {
      period: string;
      force?: boolean;
      categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>;
    },
    @User() user: any,
  ) {
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.FTP_SYNC_PERIOD,
      params: {
        period: body.period,
        force: body.force ?? false,
        categories: body.categories,
      },
      tenantId: user?.tenantId,
      createdBy: user?.sub,
      progressTotal: 1,
    });

    setImmediate(() =>
      this.runSyncPeriodJob(
        job.id,
        body.period,
        body.force ?? false,
        body.categories,
      ),
    );

    return {
      jobId: job.id,
      statusUrl: `/etl/jobs/${job.id}`,
      message: `Sync started for period ${body.period}. Poll GET /etl/jobs/${job.id} for status.`,
    };
  }

  @Post('ftp/sync-all')
  @ApiOperation({
    summary: 'Sync ALL pending periods from FTPS (async)',
    description:
      'Starts sync for all un-imported periods in background. Returns a jobId.\n' +
      'Use `startPeriod` (YYYYMM) to skip all periods before that month.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', example: false, description: 'Force re-import all' },
        startPeriod: {
          type: 'string',
          example: '202401',
          description: 'Skip periods before this month (YYYYMM).',
        },
      },
    },
  })
  async syncAll(
    @Body() body: {
      force?: boolean;
      startPeriod?: string;
      categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>;
    },
    @User() user: any,
  ) {
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.FTP_SYNC_ALL,
      params: {
        force: body?.force ?? false,
        startPeriod: body?.startPeriod ?? null,
        categories: body?.categories,
      },
      tenantId: user?.tenantId,
      createdBy: user?.sub,
    });

    setImmediate(() =>
      this.runSyncAllJob(
        job.id,
        body?.force ?? false,
        body?.startPeriod,
        body?.categories,
      ),
    );

    return {
      jobId: job.id,
      statusUrl: `/etl/jobs/${job.id}`,
      message: `Sync-all started. Poll GET /etl/jobs/${job.id} for status.`,
    };
  }

  @Post('ftp/retry')
  @ApiOperation({
    summary: 'Retry a failed import (async)',
    description: 'Re-downloads and re-imports a specific period that previously failed',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { period: { type: 'string', example: '202401' } },
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

    return {
      jobId: job.id,
      statusUrl: `/etl/jobs/${job.id}`,
      message: `Retry started for period ${body.period}. Poll GET /etl/jobs/${job.id} for status.`,
    };
  }

  // ── FTP: Status & History ─────────────────────────────

  @Get('ftp/status')
  @ApiOperation({
    summary: 'Get sync status',
    description: 'Shows which periods/DSP folders are imported, pending, or errored',
  })
  async getStatus() {
    return this.syncService.getStatus();
  }

  @Get('ftp/history')
  @ApiOperation({
    summary: 'Get import history',
    description: 'Shows import tracking records from etl_import_history',
  })
  @ApiQuery({ name: 'period', required: false, description: 'Filter by period (YYYYMM)' })
  async getHistory(@Query('period') period?: string) {
    return this.syncService.getImportHistory(period);
  }

  // ── Sync Config ───────────────────────────────────────

  @Get('sync-config')
  @ApiOperation({ summary: 'Get current sync configuration' })
  async getSyncConfig() {
    return this.syncService.getSyncConfig();
  }

  @Put('sync-config')
  @ApiOperation({ summary: 'Update sync configuration' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['manual', 'auto'], example: 'auto' },
        cron: { type: 'string', example: '0 2 * * *' },
      },
      required: ['mode'],
    },
  })
  async setSyncConfig(@Body() body: { mode: string; cron?: string }) {
    return this.syncService.setSyncConfig(body.mode, body.cron);
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

  private async runSyncAllJob(
    jobId: string,
    force: boolean,
    startPeriod?: string,
    categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>,
  ): Promise<void> {
    try {
      await this.importJobsService.markProcessing(jobId);
      await this.importJobsService.updateProgress(
        jobId,
        { progressLabel: 'Listing periods...' },
        true,
      );

      let periods = await this.ftpService.listPeriods();
      if (startPeriod) periods = periods.filter((p) => p >= startPeriod);

      await this.importJobsService.updateProgress(
        jobId,
        {
          progressTotal: periods.length,
          progressCurrent: 0,
          progressLabel: `Found ${periods.length} periods`,
        },
        true,
      );

      const results: unknown[] = [];
      for (let i = 0; i < periods.length; i++) {
        await this.importJobsService.updateProgress(
          jobId,
          { progressCurrent: i, progressLabel: `Syncing ${periods[i]}...` },
          true,
        );
        try {
          const result = await this.syncService.syncPeriod(periods[i], force, categories);
          results.push(result);
        } catch (err) {
          results.push({ period: periods[i], error: err.message });
        }
      }

      await this.importJobsService.updateProgress(
        jobId,
        { progressCurrent: periods.length, progressLabel: 'Done' },
        true,
      );
      await this.importJobsService.markCompleted(jobId, {
        totalPeriods: periods.length,
        results,
      });
    } catch (err) {
      await this.importJobsService.markFailed(jobId, err);
    }
  }
}
