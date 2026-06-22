import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { Repository } from 'typeorm';
import { ReportImportQueueService } from './report-import-queue.service';
import { BucketR2Service } from '../../bucket2/services/bucket-r2.service';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import { CubeRebuildService } from '../../etl/services/cube-rebuild/cube-rebuild.service';
import { DspMappingService } from '../../dsp/services/dsp-mapping.service';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { ClickHouseMigrationService } from '../../clickhouse/clickhouse-migration.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import {
  FactSalesRow,
  ImportJob,
  ImportJobSourceType,
  ImportJobStatus,
} from '../../etl/interfaces';
import { WmgSalesParser } from '../../etl/parsers/sales/wmg-sales.parser';
import { ExtractedRow, ReportEntityExtractorService } from '../../release/services/report-entity-extractor.service';
import { ExchangeRateService } from '../../etl/services/exchange-rate/exchange-rate.service';
import { hasMeaningfulText, normalizeFactRows } from '../../etl/utils/fact-row-normalizer.util';
import { Label } from '../../label/entities/label.entity';

type ReportImportStage =
  | 'FACT_IMPORT'
  | 'METADATA_IMPORT'
  | 'EXCHANGE_RATE'
  | 'CUBE_REBUILD'
  | 'COMPLETED';

type ReportImportFileStatus = 'PENDING' | 'IMPORTING' | 'FACT_IMPORTED';

interface ReportImportFileCheckpoint {
  status: ReportImportFileStatus;
  sourceFileName: string;
  importSource: string;
  parserCode?: string;
  factTable: string;
  rows: number;
  affectedPeriods: string[];
  updatedAt: string;
}

interface ReportImportState {
  stage: ReportImportStage;
  files: Record<string, ReportImportFileCheckpoint>;
}

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
    private readonly reportEntityExtractorService: ReportEntityExtractorService,
    private readonly exchangeRateService: ExchangeRateService,
    @InjectRepository(Label)
    private readonly labelRepo: Repository<Label>,
    private readonly clickHouseMigrationService: ClickHouseMigrationService,
  ) {}

  onApplicationBootstrap() {
    this.initializeWorkerInBackground().catch((err) => {
      this.logger.error(`Failed to initialize Report Import Worker: ${err.message}`, err.stack);
    });
  }

  private async initializeWorkerInBackground() {
    await this.clickHouseMigrationService.waitForMigrations();

    // Redeliver any jobs stuck in processing from a previous crash
    await this.queueService.redeliverStuckJobs().catch((err) => {
      this.logger.error(`Failed to redeliver stuck jobs: ${err.message}`);
    });

    await this.recoverReportUploadJobs().catch((err) => {
      this.logger.error(`Failed to recover report upload jobs: ${err.message}`);
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

  private async recoverReportUploadJobs(): Promise<void> {
    const jobs = await this.importJobsService.findRecoverableReportUploadJobs();
    if (!jobs.length) return;

    this.logger.warn(`Recovering ${jobs.length} report import job(s) after startup`);
    for (const job of jobs) {
      if (await this.queueService.hasJob(job.id)) continue;
      await this.queueService.pushJob(job.id);
    }
  }

  private getFileKey(file: { r2Key?: string; path?: string }): string {
    return file.r2Key || file.path || '';
  }

  private getReportImportState(job: ImportJob, files: any[]): ReportImportState {
    const raw = job.params?.reportImportState as Partial<ReportImportState> | undefined;
    const state: ReportImportState = {
      stage: this.isReportImportStage(raw?.stage) ? raw!.stage! : 'FACT_IMPORT',
      files: raw?.files && typeof raw.files === 'object' ? { ...raw.files } : {},
    };

    for (const file of files) {
      const key = this.getFileKey(file);
      if (!key || state.files[key]) continue;

      const sourceFileName = path.basename(file.path);
      state.files[key] = {
        status: 'PENDING',
        sourceFileName,
        importSource: `${file.sourceCode}_report`,
        parserCode: file.parserCode,
        factTable: file.reportType === 'sales'
          ? CLICKHOUSE_TABLES.FACT_SALES_REPORT
          : CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT,
        rows: 0,
        affectedPeriods: [],
        updatedAt: new Date().toISOString(),
      };
    }

    return state;
  }

  private isReportImportStage(value: unknown): value is ReportImportStage {
    return value === 'FACT_IMPORT'
      || value === 'METADATA_IMPORT'
      || value === 'EXCHANGE_RATE'
      || value === 'CUBE_REBUILD'
      || value === 'COMPLETED';
  }

  private async saveReportImportState(jobId: string, state: ReportImportState): Promise<void> {
    await this.importJobsService.patchParams(jobId, { reportImportState: state });
  }

  private getImportedFileCheckpoints(state: ReportImportState): ReportImportFileCheckpoint[] {
    return Object.values(state.files).filter((file) => file.status === 'FACT_IMPORTED');
  }

  private escapeSqlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private async resolveFallbackLabelName(labelId?: string): Promise<string | undefined> {
    if (!labelId?.trim()) return undefined;

    const label = await this.labelRepo.findOne({
      where: { id: labelId.trim() },
    });

    return hasMeaningfulText(label?.name) ? label!.name.trim() : undefined;
  }

  private applyWmgLabelNames(
    rows: FactSalesRow[],
    fallbackLabelName: string | undefined,
  ): void {
    for (const row of rows) {
      row.label_name = fallbackLabelName || 'N/A';
    }
  }

  private async deleteFactRowsForFile(
    factTable: string,
    filename: string,
    importSource: string,
  ): Promise<void> {
    const countRows = await this.clickHouseService.query<{ cnt: string }>(
      `SELECT count() AS cnt FROM music_analytics.${factTable}
       WHERE source_file_name = {filename:String} AND import_source = {source:String}`,
      { filename, source: importSource },
    );

    if (Number(countRows[0]?.cnt ?? 0) === 0) return;

    this.logger.warn(`Deleting existing fact rows for ${filename} (${importSource}) before import/resume`);
    await this.clickHouseService.execute(
      `ALTER TABLE music_analytics.${factTable} DELETE
       WHERE source_file_name = '${this.escapeSqlString(filename)}'
         AND import_source = '${this.escapeSqlString(importSource)}'`,
    );
    await this.clickHouseService.waitForTableMutations(factTable);
  }

  private buildSourceFilter(
    checkpoints: ReportImportFileCheckpoint[],
  ): { where: string; params: Record<string, string> } {
    const params: Record<string, string> = {};
    const clauses = checkpoints.map((checkpoint, index) => {
      params[`filename${index}`] = checkpoint.sourceFileName;
      params[`source${index}`] = checkpoint.importSource;
      return `(source_file_name = {filename${index}:String} AND import_source = {source${index}:String})`;
    });

    return {
      where: clauses.length ? clauses.join(' OR ') : '0',
      params,
    };
  }

  private async loadMetadataRowsFromClickHouse(
    checkpoints: ReportImportFileCheckpoint[],
  ): Promise<ExtractedRow[]> {
    const rows: ExtractedRow[] = [];
    const byTable = new Map<string, ReportImportFileCheckpoint[]>();

    for (const checkpoint of checkpoints) {
      const tableCheckpoints = byTable.get(checkpoint.factTable) ?? [];
      tableCheckpoints.push(checkpoint);
      byTable.set(checkpoint.factTable, tableCheckpoints);
    }

    for (const [factTable, tableCheckpoints] of byTable) {
      const { where, params } = this.buildSourceFilter(tableCheckpoints);
      const tableRows = await this.clickHouseService.query<ExtractedRow>(
        `
          SELECT
            isrc,
            upc,
            argMax(track_title, score) AS track_title,
            argMax(artist_name, score) AS artist_name,
            argMax(album_title, score) AS album_title,
            argMax(label_name, score) AS label_name
          FROM (
            SELECT
              trimBoth(toString(isrc)) AS isrc,
              trimBoth(toString(upc)) AS upc,
              trimBoth(toString(track_title)) AS track_title,
              trimBoth(toString(artist_name)) AS artist_name,
              trimBoth(toString(album_title)) AS album_title,
              trimBoth(toString(label_name)) AS label_name,
              if(track_title != '' AND track_title != 'N/A', 1, 0)
                + if(artist_name != '' AND artist_name != 'N/A', 1, 0)
                + if(album_title != '' AND album_title != 'N/A', 1, 0)
                + if(label_name != '' AND label_name != 'N/A', 1, 0) AS score
            FROM music_analytics.${factTable}
            WHERE (${where})
              AND (trimBoth(toString(isrc)) != '' OR trimBoth(toString(upc)) != '')
          )
          GROUP BY upc, isrc
        `,
        params,
      );
      rows.push(...tableRows);
    }

    return rows;
  }

  private async loadAffectedPeriodsFromClickHouse(
    checkpoints: ReportImportFileCheckpoint[],
  ): Promise<string[]> {
    const periods = new Set<string>();
    const byTable = new Map<string, ReportImportFileCheckpoint[]>();

    for (const checkpoint of checkpoints) {
      const tableCheckpoints = byTable.get(checkpoint.factTable) ?? [];
      tableCheckpoints.push(checkpoint);
      byTable.set(checkpoint.factTable, tableCheckpoints);
    }

    for (const [factTable, tableCheckpoints] of byTable) {
      const { where, params } = this.buildSourceFilter(tableCheckpoints);
      const rows = await this.clickHouseService.query<{ period: string }>(
        `
          SELECT DISTINCT substring(toString(reporting_period_start), 1, 7) AS period
          FROM music_analytics.${factTable}
          WHERE (${where})
            AND period != ''
          ORDER BY period ASC
        `,
        params,
      );
      for (const row of rows) {
        if (row.period) periods.add(row.period);
      }
    }

    return Array.from(periods);
  }

  private async cleanupR2Files(files: Array<{ r2Key?: string }>): Promise<void> {
    for (const file of files) {
      if (!file.r2Key) continue;
      await this.r2Service.deletePrivate(file.r2Key).catch((err) => {
        this.logger.warn(`Failed to clean up R2 file ${file.r2Key}: ${err.message}`);
      });
    }
  }

  private async processJob(jobId: string) {
    const tempDir = path.join(os.tmpdir(), 'report-imports', jobId);
    let totalProcessedRows = 0;
    
    try {
      const currentJob = this.importJobsService.getSnapshot(jobId) ?? await this.importJobsService.findById(jobId);
      if (
        currentJob &&
        currentJob.status !== ImportJobStatus.PENDING &&
        currentJob.status !== ImportJobStatus.QUEUED &&
        currentJob.status !== ImportJobStatus.PROCESSING
      ) {
        this.logger.warn(`Skipping queued job ${jobId} because current status is ${currentJob.status}.`);
        await this.queueService.ackJob(jobId);
        return;
      }

      await this.importJobsService.markProcessing(jobId);
      let job = this.importJobsService.getSnapshot(jobId);
      if (!job) {
        job = await this.importJobsService.findById(jobId);
      }
      if (!job) {
        throw new Error(`Job ${jobId} not found in database.`);
      }

      await fs.promises.mkdir(tempDir, { recursive: true });
      const bucketName = this.r2Service.getBucketName({ isPublic: false });
      const files = (job.params?.files as any[]) || [];
      const labelIdParam = job.params?.labelId;
      const labelId = typeof labelIdParam === 'string' ? labelIdParam : undefined;
      const fallbackLabelName = await this.resolveFallbackLabelName(labelId);
      const state = this.getReportImportState(job, files);
      await this.saveReportImportState(jobId, state);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileKey = this.getFileKey(file);
        const checkpoint = state.files[fileKey];
        const filename = path.basename(file.path);
        const localFilePath = path.join(tempDir, filename);
        const isSales = file.reportType === 'sales';
        const factTable = isSales
          ? CLICKHOUSE_TABLES.FACT_SALES_REPORT
          : CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT;
        const importSource = `${file.sourceCode}_report`;

        if (checkpoint?.status === 'FACT_IMPORTED') {
          this.logger.log(`Skipping ${filename}; fact rows already imported for job ${jobId}`);
          totalProcessedRows += checkpoint.rows;
          await this.importJobsService.updateProgress(jobId, {
            progressCurrent: i + 1,
            processedRows: totalProcessedRows,
            totalRows: totalProcessedRows,
            progressLabel: `Imported: ${filename}`,
          }, true);
          continue;
        }

        state.stage = 'FACT_IMPORT';
        state.files[fileKey] = {
          status: 'IMPORTING',
          sourceFileName: filename,
          importSource,
          factTable,
          rows: 0,
          affectedPeriods: [],
          updatedAt: new Date().toISOString(),
        };
        await this.saveReportImportState(jobId, state);

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

        await this.deleteFactRowsForFile(factTable, filename, importSource);

        // 2. Parse and batch stream import
        this.logger.log(`Streaming import for file: ${filename}`);
        await this.importJobsService.updateProgress(jobId, {
          progressLabel: `Importing: ${filename}`,
        }, true);

        let fileProcessedRows = 0;
        const fileAffectedPeriods = new Set<string>();

        if (file.parserCode === 'wmg-sales') {
          const parser = new WmgSalesParser();
          
          await parser.parseFileStreaming(
            localFilePath,
            jobId,
            async (batch: FactSalesRow[]) => {
              this.applyWmgLabelNames(batch, fallbackLabelName);

              // Populate audit fields on the batch rows
              for (const r of batch) {
                r.import_source = importSource;
                r.source_file_name = filename;
                normalizeFactRows([r]);
                
                // Collect period
                if (r.reporting_period_start) {
                  fileAffectedPeriods.add(r.reporting_period_start.substring(0, 7)); // YYYY-MM
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
                totalRows: totalProcessedRows,
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

        state.files[fileKey] = {
          status: 'FACT_IMPORTED',
          sourceFileName: filename,
          importSource,
          parserCode: file.parserCode,
          factTable,
          rows: fileProcessedRows,
          affectedPeriods: Array.from(fileAffectedPeriods),
          updatedAt: new Date().toISOString(),
        };
        await this.saveReportImportState(jobId, state);
      }

      const importedCheckpoints = this.getImportedFileCheckpoints(state);

      // 3. Extract and import entities into PostgreSQL
      const totalMetadataRows = importedCheckpoints.reduce(
        (sum, checkpoint) => sum + checkpoint.rows,
        0,
      );
      if (totalMetadataRows > 0) {
        state.stage = 'METADATA_IMPORT';
        await this.saveReportImportState(jobId, state);

        this.logger.log(`Extracting and importing metadata entities to PostgreSQL for ${importedCheckpoints.length} file(s)...`);
        await this.importJobsService.updateProgress(jobId, {
          progressCurrent: 0,
          progressTotal: importedCheckpoints.length,
          progressLabel: `Importing metadata to PostgreSQL`,
        }, true);

        const entityResult = {
          totalReleases: 0,
          created: 0,
          skipped: 0,
          errors: 0,
        };

        for (let index = 0; index < importedCheckpoints.length; index += 1) {
          const checkpoint = importedCheckpoints[index];
          const rowsToImport = await this.loadMetadataRowsFromClickHouse([
            checkpoint,
          ]);
          if (!rowsToImport.length) continue;

          const result = await this.reportEntityExtractorService.extractAndImport(
            rowsToImport,
            job.tenantId, // The default tenant ID chosen on pre-validate upload form
            labelId,
            async (progress) => {
              await this.importJobsService.updateProgress(jobId, {
                progressCurrent: progress.current,
                progressTotal: progress.total,
                progressLabel: progress.label,
              }, true);
            },
            {
              sourceType: ImportJobSourceType.REPORT_UPLOAD,
              parserCode: checkpoint.parserCode,
              fileName: checkpoint.sourceFileName,
              jobId,
            },
          ).catch((err) => {
            this.logger.error(`Failed to extract/import entities to PostgreSQL for ${checkpoint.sourceFileName}: ${err.message}`);
            return { totalReleases: 0, created: 0, skipped: 0, errors: 1 };
          });

          entityResult.totalReleases += result.totalReleases;
          entityResult.created += result.created;
          entityResult.skipped += result.skipped;
          entityResult.errors += result.errors;

          await this.importJobsService.updateProgress(jobId, {
            progressLabel: `Importing metadata to PostgreSQL`,
          }, true);
        }

        this.logger.log(
          `Entity import completed: ${entityResult.created} created, ` +
          `${entityResult.skipped} skipped, ${entityResult.errors} errors.`,
        );
      }

      const affectedPeriods = new Set<string>(
        importedCheckpoints.flatMap((checkpoint) => checkpoint.affectedPeriods),
      );
      for (const period of await this.loadAffectedPeriodsFromClickHouse(importedCheckpoints)) {
        affectedPeriods.add(period);
      }

      // 3. Rebuild cubes for all affected month partitions
      if (affectedPeriods.size > 0) {
        const periods = Array.from(affectedPeriods);
        
        // Auto-sync missing exchange rates before rebuilding cubes
        this.logger.log(`Syncing missing exchange rates for periods: ${periods.join(', ')}`);
        state.stage = 'EXCHANGE_RATE';
        await this.saveReportImportState(jobId, state);
        await this.importJobsService.updateProgress(jobId, {
          progressLabel: `Syncing exchange rates...`,
        }, true);
        await this.exchangeRateService.syncMonthsForPeriods(periods).catch((err) => {
          this.logger.error(`Failed to sync exchange rates for periods: ${err.message}`);
        });

        this.logger.log(`Rebuilding cubes for affected periods: ${periods.join(', ')}`);
        state.stage = 'CUBE_REBUILD';
        await this.saveReportImportState(jobId, state);
        await this.importJobsService.updateProgress(jobId, {
          progressLabel: `Rebuilding Cubes...`,
        }, true);

        // Right now we only support sales report (WMG)
        await this.cubeRebuildService.rebuildSalesCubesForPeriods(periods);
      }

      state.stage = 'COMPLETED';
      await this.saveReportImportState(jobId, state);

      // Mark Job as COMPLETED
      await this.importJobsService.markCompleted(jobId, {
        totalProcessedRows,
        affectedPeriods: Array.from(affectedPeriods),
      });

      await this.cleanupR2Files(files);

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
