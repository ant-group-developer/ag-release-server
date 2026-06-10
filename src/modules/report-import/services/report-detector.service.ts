import { Injectable } from '@nestjs/common';
import { ReportSourceConfig, ReportSourceConfigs } from '../configs';
import * as path from 'path';

@Injectable()
export class ReportDetectorService {
  /**
   * Matches a file path against configured sources.
   * Checks both folder patterns and file name patterns.
   */
  detectConfig(filePath: string): ReportSourceConfig | null {
    const filename = path.basename(filePath);
    const parts = filePath.replace(/\\/g, '/').split('/');
    
    // Sort configs by priority (lowest number = highest priority)
    const sortedConfigs = [...ReportSourceConfigs].sort((a, b) => a.priority - b.priority);

    for (const config of sortedConfigs) {
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
