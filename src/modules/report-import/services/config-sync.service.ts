import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { ClickHouseMigrationService } from '../../clickhouse/clickhouse-migration.service';
import { ReportSourceConfigs } from '../configs';

@Injectable()
export class ConfigSyncService implements OnModuleInit {
  private readonly logger = new Logger(ConfigSyncService.name);

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly clickHouseMigrationService: ClickHouseMigrationService,
  ) {}

  onModuleInit() {
    this.syncConfigsInBackground().catch((err) => {
      this.logger.error(`Failed to sync report configs: ${err.message}`, err.stack);
    });
  }

  private async syncConfigsInBackground() {
    await this.clickHouseMigrationService.waitForMigrations();
    try {
      this.logger.log('Checking and syncing missing report source configs to ClickHouse...');
      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      for (const c of ReportSourceConfigs) {
        const id = `${c.sourceCode}_${c.reportType}`;
        const existing = await this.clickHouseService.query<any>(
          `SELECT id FROM music_analytics.report_source_configs FINAL WHERE id = {id:String} AND is_active = 1 LIMIT 1`,
          { id },
        );

        if (existing.length === 0) {
          this.logger.log(`Config '${id}' not found in ClickHouse. Syncing from code definition...`);
          const row = {
            id,
            source_code: c.sourceCode,
            source_name: c.sourceName,
            report_type: c.reportType,
            folder_patterns: c.folderPatterns,
            file_patterns: c.filePatterns,
            required_headers: c.requiredHeaders,
            parser_code: c.parserCode,
            delimiter: c.delimiter,
            default_currency: c.defaultCurrency,
            default_member: c.defaultMember,
            priority: c.priority,
            is_active: 1,
            created_at: nowStr,
            updated_at: nowStr,
          };

          await this.clickHouseService.insertBatched(
            'report_source_configs',
            [row],
            1,
          );
        }
      }

      this.logger.log('Report source configs sync check completed.');
    } catch (err) {
      this.logger.error(`Failed to sync report configs: ${err.message}`, err.stack);
    }
  }
}
