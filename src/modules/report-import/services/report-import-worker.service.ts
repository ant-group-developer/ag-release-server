import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { ReportImportQueueService } from './report-import-queue.service';
import { BucketR2Service } from '../../bucket2/services/bucket-r2.service';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import { CubeRebuildService } from '../../etl/services/cube-rebuild/cube-rebuild.service';
import { DspMappingService } from '../../dsp/services/dsp-mapping.service';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { ImportJobStatus, FactSalesRow, FactDspRow } from '../../etl/interfaces';
import { WmgSalesParser } from '../../etl/parsers/sales/wmg-sales.parser';

@Injectable()
export class ReportImportWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReportImportWorkerService.name);
  private isRunning = true;
  private workerPromise: Promise<void> | null = null;

  constructor(
    private readonly queueService: ReportImportQueueService,
    private readonly r2Service: BucketR2Service,
    private readonly importJobsService: ImportJobsService,
    private readonly cubeRebuildService: CubeRebuildService,
    private readonly dspMappingService: DspMappingService,
    private readonly clickHouseService: ClickHouseService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Starting Report Import Worker...');
    // Redeliver any jobs stuck in processing from a previous crash
    await this.queueService.redeliverStuckJobs().catch((err) => {
      this.logger.error(`Failed to redeliver stuck jobs: ${err.message}`);
    });
    
    // Start worker loop
    this.workerPromise = this.runWorkerLoop();
  }

  async onApplicationShutdown() {
    this.logger.log('Stopping Report Import Worker...');
    this.isRunning = false;
    if (this.workerPromise) {
      await this.workerPromise;
    }
  }

  private async runWorkerLoop() {
    while (this.isRunning) {
      try {
        const jobId = await this.queueService.popJob();
        if (jobId) {
          this.logger.log(`Worker picked up Job ID: ${jobId}`);
          await this.processJob(jobId);
        } else {
          // Sleep for 5 seconds if no jobs
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      } catch (err) {
        this.logger.error(`Error in worker loop: ${err.message}`, err.stack);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async processJob(jobId: string) {
    const tempDir = path.join(os.tmpdir(), 'report-imports', jobId);
    let totalProcessedRows = 0;
    
    try {
      await this.importJobsService.markProcessing(jobId);
      const job = await this.importJobsService.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found in database.`);
      }

      await fs.promises.mkdir(tempDir, { recursive: true });
      const bucketName = this.r2Service.getBucketName({ isPublic: false });
      const files = (job.params?.files as any[]) || [];
      const affectedPeriods = new Set<string>();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filename = path.basename(file.path);
        const localFilePath = path.join(tempDir, filename);

        this.logger.log(`Downloading ${filename} from R2...`);
        await this.importJobsService.updateProgress(jobId, {
          progressCurrent: i,
          progressLabel: `Downloading: ${filename}`,
        }, true);

        // Download from R2 to local temp disk
        const stream = await this.r2Service.getObjectStream({
          bucketName,
          key: file.r2Key,
        });
        const writeStream = fs.createWriteStream(localFilePath);
        await pipeline(stream, writeStream);

        // Determine destination table & columns
        const isSales = file.reportType === 'sales';
        const factTable = isSales
          ? CLICKHOUSE_TABLES.FACT_SALES_REPORT
          : CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT;

        const importSource = `${file.sourceCode}_report`;

        // 1. Check for duplicates and delete existing records from this file run
        this.logger.log(`Checking duplicates for file: ${filename} (source: ${importSource})`);
        const dupCheck = await this.clickHouseService.query<{ cnt: string }>(
          `SELECT count() AS cnt FROM music_analytics.${factTable}
           WHERE source_file_name = {filename: String} AND import_source = {source: String}`,
          { filename, source: importSource }
        );

        if (Number(dupCheck[0]?.cnt ?? 0) > 0) {
          this.logger.warn(`Found existing records for ${filename}. Deleting old data...`);
          const escapedFilename = filename.replace(/'/g, "\\'");
          await this.clickHouseService.execute(
            `ALTER TABLE music_analytics.${factTable} DELETE
             WHERE source_file_name = '${escapedFilename}' AND import_source = '${importSource}'`
          );
          // Small sleep to let ClickHouse register the delete mutation
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        // 2. Parse and batch stream import
        this.logger.log(`Streaming import for file: ${filename}`);
        await this.importJobsService.updateProgress(jobId, {
          progressLabel: `Importing: ${filename}`,
        }, true);

        let fileProcessedRows = 0;

        if (file.parserCode === 'wmg-sales') {
          const parser = new WmgSalesParser();
          
          await parser.parseFileStreaming(
            localFilePath,
            jobId,
            async (batch: FactSalesRow[]) => {
              // Populate audit fields on the batch rows
              for (const r of batch) {
                r.import_source = importSource;
                r.source_file_name = filename;
                
                // Collect period
                if (r.reporting_period_start) {
                  affectedPeriods.add(r.reporting_period_start.substring(0, 7)); // YYYY-MM
                }
              }

              // Batch insert into ClickHouse
              await this.clickHouseService.insertBatched(
                factTable,
                batch as unknown as Record<string, unknown>[],
                50000
              );

              fileProcessedRows += batch.length;
              totalProcessedRows += batch.length;

              await this.importJobsService.updateProgress(jobId, {
                processedRows: totalProcessedRows,
              });
            },
            {
              batchSize: 50000,
              resolveDspId: async (dspName: string) => {
                const r = await this.dspMappingService.resolveOrCreateDspReport(dspName, 'wmg_report');
                return r.id_dsps_report;
              },
              revenueCurrency: file.defaultCurrency || 'VND',
              memberName: file.defaultMember || 'AMG GROUP',
            }
          );
        } else {
          throw new Error(`Unsupported parser code: ${file.parserCode}`);
        }

        // Delete processed local file
        await fs.promises.unlink(localFilePath).catch(() => {});
        
        // Clean R2 uploaded temp file to save space
        await this.r2Service.deletePrivate(file.r2Key).catch((err) => {
          this.logger.warn(`Failed to clean up R2 file ${file.r2Key}: ${err.message}`);
        });
      }

      // 3. Rebuild cubes for all affected month partitions
      if (affectedPeriods.size > 0) {
        const periods = Array.from(affectedPeriods);
        this.logger.log(`Rebuilding cubes for affected periods: ${periods.join(', ')}`);
        
        await this.importJobsService.updateProgress(jobId, {
          progressLabel: `Rebuilding Cubes...`,
        }, true);

        // Right now we only support sales report (WMG)
        await this.cubeRebuildService.rebuildSalesCubesForPeriods(periods);
      }

      // Mark Job as COMPLETED
      await this.importJobsService.markCompleted(jobId, {
        totalProcessedRows,
        affectedPeriods: Array.from(affectedPeriods),
      });

      // Ack Job to remove from processing queue
      await this.queueService.ackJob(jobId);
    } catch (err) {
      this.logger.error(`Failed to process Job ${jobId}: ${err.message}`, err.stack);
      
      // Update job status in database to FAILED
      await this.importJobsService.markFailed(jobId, err.message).catch((dbErr) => {
        this.logger.error(`Failed to update job status to FAILED in ClickHouse: ${dbErr.message}`);
      });

      // Remove from processing queue to prevent loop block
      await this.queueService.ackJob(jobId).catch(() => {});
    } finally {
      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
