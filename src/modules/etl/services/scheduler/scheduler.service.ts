import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncService } from '../sync/sync.service';
import { ImportJobsService } from '../import-jobs/import-jobs.service';
import { ImportJobSourceType } from '../../interfaces';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly importJobsService: ImportJobsService,
  ) {}

  /**
   * Auto-sync cron job. Runs daily at 2:00 AM by default.
   * Only executes if sync_mode is 'auto'. Tạo ImportJob row để có audit log.
   */
  @Cron('0 2 * * *', { name: 'ftp-auto-sync' })
  async handleAutoSync() {
    const config = await this.syncService.getSyncConfig();

    if (config.mode !== 'auto') {
      this.logger.debug('Auto-sync skipped (mode is manual)');
      return;
    }

    this.logger.log('Auto-sync triggered by cron...');

    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.FTP_AUTO_CRON,
      params: { trigger: 'cron', cronExpr: '0 2 * * *' },
    });

    try {
      await this.importJobsService.markProcessing(job.id);
      const results = await this.syncService.syncAll(false);
      const totalRows = results.reduce((sum, r) => sum + (r.totalRows ?? 0), 0);
      const totalPeriods = results.length;

      this.logger.log(
        `Auto-sync complete: ${totalPeriods} periods, ${totalRows} total rows`,
      );

      await this.importJobsService.markCompleted(job.id, {
        totalPeriods,
        totalRows,
        results,
      });
    } catch (err) {
      this.logger.error(`Auto-sync failed: ${err.message}`, err.stack);
      await this.importJobsService.markFailed(job.id, err);
    }
  }
}
