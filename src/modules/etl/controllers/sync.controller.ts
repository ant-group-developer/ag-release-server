import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { SyncService } from '../services/sync/sync.service';
import { FtpService } from '../services/ftp/ftp.service';
import { JobService } from '../services/job/job.service';

@ApiTags('ETL')
@Controller('etl')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly ftpService: FtpService,
    private readonly jobService: JobService,
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
    description: 'Starts download+import in background. Returns a job ID to poll for status.',
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
  async syncPeriod(@Body() body: { period: string; force?: boolean }) {
    const jobId = this.jobService.createJob(
      'sync',
      { period: body.period, force: body.force || false },
      async (_job, updateProgress) => {
        updateProgress(0, 1, `Syncing ${body.period}...`);
        const result = await this.syncService.syncPeriod(body.period, body.force || false);
        updateProgress(1, 1, 'Done');
        return result;
      },
    );

    return { jobId, message: `Sync started for period ${body.period}. Poll GET /etl/jobs/${jobId} for status.` };
  }

  @Post('ftp/sync-all')
  @ApiOperation({
    summary: 'Sync ALL pending periods from FTPS (async)',
    description:
      'Starts sync for all un-imported periods in background. Returns a job ID.\n' +
      'Use `startPeriod` (YYYYMM) to skip all periods before that month.\n' +
      'Example: startPeriod=202401 → only sync from Jan 2024 onwards.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', example: false, description: 'Force re-import all' },
        startPeriod: {
          type: 'string',
          example: '202401',
          description: 'Skip periods before this month (YYYYMM). E.g. 202401 = only sync from Jan 2024 onwards.',
        },
      },
    },
  })
  async syncAll(@Body() body: { force?: boolean; startPeriod?: string }) {
    const jobId = this.jobService.createJob(
      'sync-all',
      { force: body?.force || false, startPeriod: body?.startPeriod },
      async (_job, updateProgress) => {
        let periods = await this.ftpService.listPeriods();

        // Filter periods if startPeriod is provided (skip earlier periods)
        const startPeriod = body?.startPeriod;
        if (startPeriod) {
          periods = periods.filter((p) => p >= startPeriod);
        }

        updateProgress(0, periods.length, 'Listing periods...');

        const results = [];
        for (let i = 0; i < periods.length; i++) {
          updateProgress(i, periods.length, `Syncing ${periods[i]}...`);
          try {
            const result = await this.syncService.syncPeriod(periods[i], body?.force || false);
            results.push(result);
          } catch (err) {
            results.push({ period: periods[i], error: err.message });
          }
        }

        updateProgress(periods.length, periods.length, 'Done');
        return results;
      },
    );

    return { jobId, message: `Sync-all started. Poll GET /etl/jobs/${jobId} for status.` };
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
      },
      required: ['period'],
    },
  })
  async retryImport(@Body() body: { period: string }) {
    const jobId = this.jobService.createJob(
      'retry',
      { period: body.period },
      async (_job, updateProgress) => {
        updateProgress(0, 1, `Retrying ${body.period}...`);
        const result = await this.syncService.syncPeriod(body.period, true);
        updateProgress(1, 1, 'Done');
        return result;
      },
    );

    return { jobId, message: `Retry started for period ${body.period}. Poll GET /etl/jobs/${jobId} for status.` };
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
  @ApiOperation({
    summary: 'Get current sync configuration',
    description: 'Returns sync mode (manual/auto) and cron expression',
  })
  async getSyncConfig() {
    return this.syncService.getSyncConfig();
  }

  @Put('sync-config')
  @ApiOperation({
    summary: 'Update sync configuration',
    description: 'Switch between manual and auto sync mode',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['manual', 'auto'], example: 'auto' },
        cron: { type: 'string', example: '0 2 * * *', description: 'Cron expression (optional)' },
      },
      required: ['mode'],
    },
  })
  async setSyncConfig(@Body() body: { mode: string; cron?: string }) {
    return this.syncService.setSyncConfig(body.mode, body.cron);
  }
}
