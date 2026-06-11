import { Injectable } from '@nestjs/common';
import { ReportSourceConfig } from '../configs';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import * as path from 'path';

@Injectable()
export class ReportDetectorService {
  constructor(private readonly clickHouseService: ClickHouseService) {}

  /**
   * Matches a file path against configured sources.
   * Checks both folder patterns and file name patterns.
   */
  async detectConfig(filePath: string): Promise<ReportSourceConfig | null> {
    const filename = path.basename(filePath);
    const parts = filePath.replace(/\\/g, '/').split('/');
    
    // Fetch active configs from ClickHouse ordered by priority (lowest number = highest priority)
    const rows = await this.clickHouseService.query<any>(
      `SELECT * FROM music_analytics.report_source_configs FINAL WHERE is_active = 1 ORDER BY priority ASC`
    );

    const configs: ReportSourceConfig[] = rows.map((r) => ({
      sourceCode: r.source_code,
      sourceName: r.source_name,
      reportType: r.report_type,
      folderPatterns: r.folder_patterns,
      filePatterns: r.file_patterns,
      requiredHeaders: r.required_headers,
      parserCode: r.parser_code,
      delimiter: r.delimiter,
      defaultCurrency: r.default_currency,
      defaultMember: r.default_member,
      priority: Number(r.priority),
    }));

    for (const config of configs) {
      // 1. Check folder patterns (if specified)
      if (config.folderPatterns && config.folderPatterns.length > 0) {
        const folderMatched = config.folderPatterns.some((pattern) => {
          return parts.some((part) => new RegExp(pattern, 'i').test(part));
        });
        if (!folderMatched) continue;
      }

      // 2. Check file patterns
      const fileMatched = config.filePatterns.some((pattern) => {
        return new RegExp(pattern, 'i').test(filename);
      });

      if (fileMatched) {
        return config;
      }
    }

    return null;
  }
}
