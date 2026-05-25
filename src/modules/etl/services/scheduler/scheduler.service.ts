import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncService } from '../sync/sync.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly syncService: SyncService) {}

  /**
   * Auto-sync cron job.
   * Runs daily at 2:00 AM by default.
   * Only executes if sync_mode is 'auto'.
   */
  @Cron('0 2 * * *', { name: 'ftp-auto-sync' })
  async handleAutoSync() {
    const config = await this.syncService.getSyncConfig();

    if (config.mode !== 'auto') {
      this.logger.debug('Auto-sync skipped (mode is manual)');
      return;
    }

    this.logger.log('Auto-sync triggered by cron...');

    try {
      const results = await this.syncService.syncAll(false);
      const totalRows = results.reduce((sum, r) => sum + r.totalRows, 0);
      const totalPeriods = results.length;

      this.logger.log(
        `Auto-sync complete: ${totalPeriods} periods, ${totalRows} total rows`,
      );
    } catch (err) {
      this.logger.error(`Auto-sync failed: ${err.message}`, err.stack);
    }
  }
}
