import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseService, CLICKHOUSE_TABLES } from '../../../clickhouse';
import { getParserForFolder } from '../../parsers';
import { getSalesParserForFolder } from '../../parsers/sales';
import { DeezerIllegitimateParser, SoundCloudIllegitimateParser, SpotifyIllegitimateParser, TiktokIllegitimateParser } from '../../parsers/illegitimate';
import { FactDspRow, FactSalesRow } from '../../interfaces';
import { DspMappingService } from '../../../dsp/services/dsp-mapping.service';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';
import { ReportEntityExtractorService } from '../../../release/services/report-entity-extractor.service';
import { normalizeFactRows } from '../../utils/fact-row-normalizer.util';

export interface ImportResult {
  batchId: string;
  totalRows: number;
  totalFiles: number;
  durationMs: number;
  dspResults: Array<{
    dsp: string;
    folder: string;
    files: number;
    rows: number;
    durationMs: number;
    fileNames: string[];
  }>;
  errors: string[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly dspMappingService: DspMappingService,
    private readonly excludePatternService: ExcludePatternService,
    private readonly reportEntityExtractorService: ReportEntityExtractorService,
  ) { }

  /**
   * Import all DSP data from a folder structure.
   * Supports both layouts:
   *   - dataPath/trends/dsp-folder/ + dataPath/usage/dsp-folder/
   *   - dataPath/dsp-folder/ (legacy)
   */
  async importFolder(dataPath: string): Promise<ImportResult> {
    const startTime = Date.now();
    const batchId = uuidv4();
    const result: ImportResult = {
      batchId,
      totalRows: 0,
      totalFiles: 0,
      durationMs: 0,
      dspResults: [],
      errors: [],
    };

    this.logger.log(`Starting import batch ${batchId} from: ${dataPath}`);

    // Collect all DSP folder paths to process
    const dspFoldersToProcess: Array<{ path: string; name: string; category?: string }> = [];

    // Strategy 1: Check for trends/, usage/, sales/, illegitimate_activity/ subdirectories
    for (const subDir of ['trends', 'usage', 'sales', 'illegitimate_activity']) {
      const subPath = path.join(dataPath, subDir);
      if (fs.existsSync(subPath)) {
        const allDirs = fs.readdirSync(subPath, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'));
        for (const d of allDirs) {
          if (await this.excludePatternService.shouldExclude(d.name, 'folder')) {
            this.logger.log(`  ⛔ [EXCLUDED] Skip folder ${subDir}/${d.name} (matched exclude pattern)`);
            continue;
          }
          dspFoldersToProcess.push({ path: path.join(subPath, d.name), name: d.name, category: subDir });
        }
      }
    }

    // Strategy 2: Check root dataPath for DSP folders directly (202205 style)
    const rootDirs = fs.readdirSync(dataPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'trends' && d.name !== 'usage' && !d.name.startsWith('.'));
    for (const d of rootDirs) {
      if (await this.excludePatternService.shouldExclude(d.name, 'folder')) {
        this.logger.log(`  ⛔ [EXCLUDED] Skip folder ${d.name} (matched exclude pattern)`);
        continue;
      }
      dspFoldersToProcess.push({ path: path.join(dataPath, d.name), name: d.name });
    }

    this.logger.log(`Found ${dspFoldersToProcess.length} DSP folders to process`);

    for (const { path: dspPath, name: dspFolder, category } of dspFoldersToProcess) {
      const dspResult = await this.importDspFolder(dspPath, dspFolder, batchId, category || '');

      if (dspResult) {
        result.dspResults.push(dspResult);
        result.totalRows += dspResult.rows;
        result.totalFiles += dspResult.files;
      }
    }

    result.durationMs = Date.now() - startTime;

    this.logger.log(
      `Import batch ${batchId} complete: ${result.totalRows} rows from ${result.totalFiles} files in ${result.durationMs}ms`,
    );

    return result;
  }

  /**
   * Import all files from a single DSP folder.
   * PUBLIC — used by SyncService for FTP imports.
   */
  async importDspFolder(
    folderPath: string,
    folderName: string,
    batchId: string,
    sourceCategory: string = '',
  ): Promise<ImportResult['dspResults'][0] | null> {
    // Pre-load file exclude check once (avoids repeated async calls inside findDataFiles)
    const fileExcluder = async (name: string) => this.excludePatternService.shouldExclude(name, 'file');

    // Route to the correct import method based on category
    if (sourceCategory === 'sales') {
      return this.importSalesDspFolder(folderPath, folderName, batchId, fileExcluder);
    }
    if (sourceCategory === 'illegitimate_activity') {
      return this.importIllegitimateDspFolder(folderPath, folderName, batchId, fileExcluder);
    }
    // Default: trends / usage → existing parsers → fact_dsp
    return this.importTrendsDspFolder(folderPath, folderName, batchId, sourceCategory, fileExcluder);
  }

  /**
   * Import trends/usage data → fact_dsp_comprehensive_report (existing logic).
   */
  private async importTrendsDspFolder(
    folderPath: string,
    folderName: string,
    batchId: string,
    sourceCategory: string,
    fileExcluder: (name: string) => Promise<boolean>,
  ): Promise<ImportResult['dspResults'][0] | null> {
    // Resolve or create dsps_report for this folder
    const dspsReport = await this.dspMappingService.resolveOrCreateDspReport(folderName, 'ftp_folder');

    const parser = getParserForFolder(folderName);
    if (!parser) {
      this.logger.warn(`No trends parser for folder: ${folderName}`);
      return null;
    }

    const startTime = Date.now();
    this.logger.log(`Parsing DSP folder: ${folderName} (${sourceCategory || 'trends'})`);
    const files = await this.findDataFiles(folderPath, fileExcluder);
    const allRows: FactDspRow[] = [];

    for (const filePath of files) {
      try {
        const rows = await parser.parseFile(filePath, batchId);
        const sourceFileName = path.basename(filePath);
        for (const row of rows) {
          if (sourceCategory) {
            row.source_category = sourceCategory;
          }
          row.dsp_id = dspsReport.id_dsps_report;
          row.import_source = 'ftp';
          row.source_file_name = sourceFileName;
          normalizeFactRows([row]);
        }
        allRows.push(...rows);
      } catch (err) {
        this.logger.error(`Error parsing ${path.basename(filePath)}: ${err.message}`);
      }
    }

    if (allRows.length > 0) {
      try {
        await this.clickHouseService.insertBatched(
          CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT,
          allRows as unknown as Record<string, unknown>[],
          50_000,
        );
        // Trích xuất metadata và import release/track sang PostgreSQL
        await this.reportEntityExtractorService.extractAndImport(allRows).catch((err) => {
          this.logger.error(`Failed to extract/import entities from comprehensive report for ${folderName}: ${err.message}`);
        });
      } catch (err) {
        this.logger.error(`Bulk insert failed for ${folderName}: ${err.message}`);
      }
    }

    return this.buildResult(folderName, files, allRows.length, startTime);
  }

  /**
   * Import sales data → fact_sales_report (new table).
   */
  private async importSalesDspFolder(
    folderPath: string,
    folderName: string,
    batchId: string,
    fileExcluder: (name: string) => Promise<boolean>,
  ): Promise<ImportResult['dspResults'][0] | null> {
    // Resolve or create dsps_report for this folder
    const dspsReport = await this.dspMappingService.resolveOrCreateDspReport(folderName, 'ftp_folder');

    const parser = getSalesParserForFolder(folderName);
    if (!parser) {
      this.logger.warn(`⚠️ [UNKNOWN DSP] No sales parser found for folder: "${folderName}" — data skipped. Please add a parser for this DSP.`);
      return null;
    }

    const startTime = Date.now();
    this.logger.log(`Parsing SALES folder: ${folderName}`);
    const files = await this.findDataFiles(folderPath, fileExcluder);
    const allRows: FactSalesRow[] = [];

    for (const filePath of files) {
      try {
        const rows = await parser.parseFile(filePath, batchId);
        const sourceFileName = path.basename(filePath);
        // Replace dsp_id with id_dsps_report from dsps_report
        for (const row of rows) {
          row.dsp_id = dspsReport.id_dsps_report;
          row.import_source = 'ftp';
          row.source_file_name = sourceFileName;
          normalizeFactRows([row]);
        }
        allRows.push(...rows);
      } catch (err) {
        this.logger.error(`Error parsing sales ${path.basename(filePath)}: ${err.message}`);
      }
    }

    if (allRows.length > 0) {
      try {
        await this.clickHouseService.insertBatched(
          CLICKHOUSE_TABLES.FACT_SALES_REPORT,
          allRows as unknown as Record<string, unknown>[],
          50_000,
        );
        // Trích xuất metadata và import release/track sang PostgreSQL
        await this.reportEntityExtractorService.extractAndImport(allRows).catch((err) => {
          this.logger.error(`Failed to extract/import entities from sales report for ${folderName}: ${err.message}`);
        });
      } catch (err) {
        this.logger.error(`Sales bulk insert failed for ${folderName}: ${err.message}`);
      }
    }

    return this.buildResult(folderName, files, allRows.length, startTime);
  }

  /**
   * Import illegitimate data → fact_dsp_comprehensive_report (quantity_invalid).
   */
  private async importIllegitimateDspFolder(
    folderPath: string,
    folderName: string,
    batchId: string,
    fileExcluder: (name: string) => Promise<boolean>,
  ): Promise<ImportResult['dspResults'][0] | null> {
    const prefix = folderName.split('-')[0];
    let parser;
    if (prefix === 'dzr') parser = new DeezerIllegitimateParser();
    else if (prefix === 'scu') parser = new SoundCloudIllegitimateParser();
    else if (prefix === 'spo') parser = new SpotifyIllegitimateParser();
    else if (prefix === 'tiktok') parser = new TiktokIllegitimateParser();
    else {
      this.logger.warn(`No illegitimate parser for folder: ${folderName}`);
      return null;
    }

    // Resolve or create dsps_report for this folder
    const dspsReport = await this.dspMappingService.resolveOrCreateDspReport(folderName, 'ftp_folder');

    const startTime = Date.now();
    this.logger.log(`Parsing ILLEGITIMATE folder: ${folderName}`);
    const files = await this.findDataFiles(folderPath, fileExcluder);
    const allRows: FactDspRow[] = [];

    for (const filePath of files) {
      try {
        const rows = await parser.parseFile(filePath, batchId);
        const sourceFileName = path.basename(filePath);
        // Replace dsp_id with id_dsps_report
        for (const row of rows) {
          row.dsp_id = dspsReport.id_dsps_report;
          row.import_source = 'ftp';
          row.source_file_name = sourceFileName;
          normalizeFactRows([row]);
        }
        allRows.push(...rows);
      } catch (err) {
        this.logger.error(`Error parsing illegitimate ${path.basename(filePath)}: ${err.message}`);
      }
    }

    if (allRows.length > 0) {
      try {
        await this.clickHouseService.insertBatched(
          CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT,
          allRows as unknown as Record<string, unknown>[],
          50_000,
        );
      } catch (err) {
        this.logger.error(`Illegitimate bulk insert failed for ${folderName}: ${err.message}`);
      }
    }

    return this.buildResult(folderName, files, allRows.length, startTime);
  }

  private buildResult(
    folderName: string,
    files: string[],
    totalRows: number,
    startTime: number,
  ): ImportResult['dspResults'][0] {
    const duration = Date.now() - startTime;
    this.logger.log(`${folderName}: ${totalRows} rows from ${files.length} files in ${duration}ms`);
    const dspName = folderName.includes('-') ? folderName.split('-').slice(1).join('-') : folderName;
    return {
      dsp: dspName,
      folder: folderName,
      files: files.length,
      rows: totalRows,
      durationMs: duration,
      fileNames: files.map((f) => path.basename(f)),
    };
  }

  /**
   * Recursively find all data files (.csv, .tsv, .txt, + .gz variants) in a folder.
   * When both compressed (.tsv.gz) and uncompressed (.tsv) exist, prefer .gz only
   * to avoid double-importing the same data.
   * Files matched by fileExcluder are excluded.
   */
  private async findDataFiles(
    dir: string,
    fileExcluder: (name: string) => Promise<boolean>,
  ): Promise<string[]> {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const fileNames = new Set<string>();

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await this.findDataFiles(fullPath, fileExcluder));
      } else {
        const name = entry.name.toLowerCase();
        const isData =
          name.endsWith('.csv') ||
          name.endsWith('.tsv') ||
          name.endsWith('.txt') ||
          name.endsWith('.zip') ||
          name.endsWith('.csv.gz') ||
          name.endsWith('.tsv.gz') ||
          name.endsWith('.txt.gz');

        if (isData) {
          if (await fileExcluder(entry.name)) {
            this.logger.debug(`  ⛔ [EXCLUDED] Skip file ${entry.name} (matched exclude pattern)`);
            continue;
          }
          fileNames.add(entry.name);
          results.push(fullPath);
        }
      }
    }

    // Remove uncompressed files if .gz version exists (avoid double import)
    return results.filter((f) => {
      const name = path.basename(f);
      if (!name.endsWith('.gz') && fileNames.has(name + '.gz')) {
        return false; // Skip — .gz version will be imported instead
      }
      return true;
    }).sort();
  }
}
