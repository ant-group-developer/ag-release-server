import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { ReportSourceConfigs } from '../configs';

@Injectable()
export class ConfigSyncService implements OnModuleInit {
  private readonly logger = new Logger(ConfigSyncService.name);

  constructor(private readonly clickHouseService: ClickHouseService) {}

  async onModuleInit() {
    try {
      // Check if table has rows first
      const countResult = await this.clickHouseService.query<{ total: string }>(
        'SELECT count() AS total FROM music_analytics.report_source_configs',
      );
      const total = Number(countResult[0]?.total ?? 0);

      if (total > 0) {
        this.logger.log('Report source configs table already contains data. Skipping initial sync.');
        return;
      }

      this.logger.log('Syncing report source configs to ClickHouse...');
      
      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const rows = ReportSourceConfigs.map((c) => ({
        id: `${c.sourceCode}_${c.reportType}`,
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
      }));

      await this.clickHouseService.insertBatched(
        'report_source_configs',
        rows,
        100,
      );

      this.logger.log(`Successfully synced ${rows.length} report configs.`);
    } catch (err) {
      this.logger.error(`Failed to sync report configs: ${err.message}`, err.stack);
    }
  }
}
