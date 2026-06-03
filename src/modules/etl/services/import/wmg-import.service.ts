import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseService, CLICKHOUSE_TABLES } from '../../../clickhouse';
import { DspMappingService } from '../../../dsp/services/dsp-mapping.service';
import { WmgSalesParser } from '../../parsers/sales/wmg-sales.parser';
import { FactSalesRow } from '../../interfaces';

export interface WmgImportOptions {
  revenueCurrency?: string;
  memberName?: string;
  source?: string;
}

export interface WmgImportResult {
  batchId: string;
  totalRows: number;
  uniqueDsps: string[];
  skippedRows: number;
  durationMs: number;
  errors: string[];
}

@Injectable()
export class WmgImportService {
  private readonly logger = new Logger(WmgImportService.name);

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly dspMappingService: DspMappingService,
  ) {}

  async importFile(filePath: string, opts: WmgImportOptions = {}): Promise<WmgImportResult> {
    const startTime = Date.now();
    const batchId = uuidv4();
    let totalInserted = 0;
    const errors: string[] = [];

    this.logger.log(`Starting WMG import batch=${batchId} file=${filePath}`);

    // Per-import DSP id cache (on top of DspMappingService internal cache)
    const dspIdCache = new Map<string, string>();

    const resolveDspId = async (dspName: string): Promise<string> => {
      const cached = dspIdCache.get(dspName);
      if (cached) return cached;
      const dspsReport = await this.dspMappingService.resolveOrCreateDspReport(
        dspName,
        opts.source || 'wmg_report',
      );
      dspIdCache.set(dspName, dspsReport.id_dsps_report);
      return dspsReport.id_dsps_report;
    };

    const onBatch = async (rows: FactSalesRow[]): Promise<void> => {
      await this.clickHouseService.insert(
        CLICKHOUSE_TABLES.FACT_SALES_REPORT,
        rows as unknown as Record<string, unknown>[],
      );
      totalInserted += rows.length;
      this.logger.log(
        `Flushed ${rows.length} rows (total ${totalInserted}) | heap=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      );
    };

    try {
      const parser = new WmgSalesParser();
      const result = await parser.parseFileStreaming(filePath, batchId, onBatch, {
        batchSize: 50_000,
        resolveDspId,
        revenueCurrency: opts.revenueCurrency || 'VND',
        memberName: opts.memberName || 'AMG GROUP',
      });

      this.logger.log(
        `WMG import complete batch=${batchId} totalRows=${totalInserted} skipped=${result.skippedRows} dsps=${result.uniqueDsps.size} duration=${Date.now() - startTime}ms`,
      );

      return {
        batchId,
        totalRows: totalInserted,
        uniqueDsps: [...result.uniqueDsps],
        skippedRows: result.skippedRows,
        durationMs: Date.now() - startTime,
        errors,
      };
    } catch (err) {
      this.logger.error(`WMG import failed batch=${batchId}: ${err.message}`, err.stack);
      errors.push(err.message);
      return {
        batchId,
        totalRows: totalInserted,
        uniqueDsps: [...dspIdCache.keys()],
        skippedRows: 0,
        durationMs: Date.now() - startTime,
        errors,
      };
    } finally {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        this.logger.warn(`Failed to cleanup upload file ${filePath}: ${e.message}`);
      }
    }
  }
}
