import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseService, CLICKHOUSE_TABLES } from '../../../clickhouse';
import { DspMappingService } from '../../../dsp/services/dsp-mapping.service';
import { WmgSalesParser } from '../../parsers/sales/wmg-sales.parser';
import { FactSalesRow, ImportJob, ImportJobSourceType } from '../../interfaces';
import { ImportJobsService } from '../import-jobs/import-jobs.service';

export interface WmgImportOptions {
  revenueCurrency?: string;
  memberName?: string;
  source?: string;
}

export interface WmgImportContext {
  tenantId?: string;
  userId?: string;
}

@Injectable()
export class WmgImportService {
  private readonly logger = new Logger(WmgImportService.name);

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly dspMappingService: DspMappingService,
    private readonly importJobsService: ImportJobsService,
  ) {}

  /**
   * Enqueue: tạo job row PENDING, schedule worker chạy async, return ngay.
   * Phải nhanh (< 1s) để controller trả 202 cho client trước khi Cloudflare timeout.
   */
  async enqueue(
    filePath: string,
    fileName: string,
    fileSizeBytes: number,
    opts: WmgImportOptions,
    ctx: WmgImportContext = {},
  ): Promise<ImportJob> {
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.WMG_UPLOAD,
      fileName,
      filePath,
      fileSizeBytes,
      params: {
        revenueCurrency: opts.revenueCurrency ?? 'VND',
        memberName: opts.memberName ?? 'AMG GROUP',
        source: opts.source ?? 'wmg_report',
      },
      tenantId: ctx.tenantId,
      createdBy: ctx.userId,
    });

    setImmediate(() => {
      this.processJob(job.id).catch((err) => {
        this.logger.error(`processJob ${job.id} crashed: ${err.message}`, err.stack);
      });
    });

    return job;
  }

  /**
   * Worker: load job từ DB, parse file, stream insert vào ClickHouse,
   * update progress mỗi flush, mark COMPLETED/FAILED. Không throw ra ngoài.
   */
  async processJob(jobId: string): Promise<void> {
    const job = await this.importJobsService.findById(jobId);
    if (!job) {
      this.logger.warn(`processJob: job ${jobId} not found`);
      return;
    }

    await this.importJobsService.markProcessing(jobId);
    const batchId = uuidv4();
    await this.importJobsService.setBatchId(jobId, batchId);

    let totalInserted = 0;
    const dspIdCache = new Map<string, string>();
    const params = job.params as {
      revenueCurrency?: string;
      memberName?: string;
      source?: string;
    };

    const resolveDspId = async (dspName: string): Promise<string> => {
      const cached = dspIdCache.get(dspName);
      if (cached) return cached;
      const dspsReport = await this.dspMappingService.resolveOrCreateDspReport(
        dspName,
        params.source || 'wmg_report',
      );
      dspIdCache.set(dspName, dspsReport.id_dsps_report);
      return dspsReport.id_dsps_report;
    };

    try {
      const parser = new WmgSalesParser();
      const onBatch = async (rows: FactSalesRow[]): Promise<void> => {
        await this.clickHouseService.insert(
          CLICKHOUSE_TABLES.FACT_SALES_REPORT,
          rows as unknown as Record<string, unknown>[],
        );
        totalInserted += rows.length;
        await this.importJobsService.updateProgress(jobId, {
          processedRows: totalInserted,
          progressLabel: `Inserted ${totalInserted} rows`,
        });
        this.logger.log(
          `Job ${jobId}: flushed ${rows.length} rows (total ${totalInserted}) | heap=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        );
      };

      const result = await parser.parseFileStreaming(job.filePath, batchId, onBatch, {
        batchSize: 50_000,
        resolveDspId,
        revenueCurrency: params.revenueCurrency || 'VND',
        memberName: params.memberName || 'AMG GROUP',
      });

      await this.importJobsService.updateProgress(
        jobId,
        {
          processedRows: totalInserted,
          skippedRows: result.skippedRows,
          totalRows: totalInserted,
          progressTotal: 1,
          progressCurrent: 1,
          progressLabel: 'Done',
        },
        true,
      );

      await this.importJobsService.markCompleted(jobId, {
        batchId,
        totalRows: totalInserted,
        uniqueDsps: [...result.uniqueDsps],
        skippedRows: result.skippedRows,
      });
    } catch (err) {
      await this.importJobsService.markFailed(jobId, err);
    } finally {
      try {
        if (job.filePath && fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
      } catch (e) {
        this.logger.warn(`Failed to cleanup upload file ${job.filePath}: ${e.message}`);
      }
    }
  }
}
