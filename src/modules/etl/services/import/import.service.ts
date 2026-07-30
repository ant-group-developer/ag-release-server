import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CLICKHOUSE_TABLES, ClickHouseService } from '../../../clickhouse';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';
import { ResolvedFtpParserConfig } from '../../../dsp-report/services/ftp-parser-config.service';
import { DspMappingService } from '../../../dsp/services/dsp-mapping.service';
import {
	FactDspRow,
	FactSalesRow,
	ImportJobSourceType,
} from '../../interfaces';
import { getParserForFolder } from '../../parsers';
import {
	DeezerIllegitimateParser,
	SoundCloudIllegitimateParser,
	SpotifyIllegitimateParser,
	TiktokIllegitimateParser,
} from '../../parsers/illegitimate';
import { getSalesParserForFolder } from '../../parsers/sales';

import { DspReportService } from '../../../dsp-report/services/dsp-report.service';
import { ReportEntityExtractorService } from '../../../release/services/report-entity-extractor.service';
import {
	hasMeaningfulText,
	normalizeFactRows,
} from '../../utils/fact-row-normalizer.util';

const REVELATOR_IMPORT_SOURCE = 'bombshelter';

import { ParseFileStats } from '../../parsers/base.parser';

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
		fileStats?: ParseFileStats[];
		releases?: {
			totalReleases: number;
			created: number;
			skipped: number;
			errors: number;
			inDb: number;
			pending: number;
		} | null;
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
		private readonly dspReportService: DspReportService,
		private readonly reportEntityExtractorService: ReportEntityExtractorService,
	) {}

	/**
	 * Trigger refresh dsp_report_stats sau khi ETL nạp fact tables + import
	 * release/track/video xong. Background để không chặn caller.
	 */
	private refreshStatsAfterImport(
		rows: Array<{ dsp_id?: string }>,
		folder: string,
	): void {
		const distinctDspIds = Array.from(
			new Set(
				rows.map((r) => r.dsp_id).filter((id): id is string => !!id),
			),
		);
		if (distinctDspIds.length === 0) return;
		void this.dspReportService
			.refreshStats(distinctDspIds)
			.catch((err: any) =>
				this.logger.error(
					`refreshStats after import ${folder} failed for ${distinctDspIds.length} ids: ${err.message}`,
					err.stack,
				),
			);
	}

	/**
	 * Group parsed rows theo source_file_name.
	 */
	private groupRowsBySourceFile<T extends { source_file_name?: string }>(
		rows: T[],
	): Map<string, T[]> {
		const grouped = new Map<string, T[]>();
		for (const row of rows) {
			const fileName = row.source_file_name?.trim() || 'unknown';
			const list = grouped.get(fileName) ?? [];
			list.push(row);
			grouped.set(fileName, list);
		}
		return grouped;
	}

	/**
	 * Resolve DSP type ('audio' | 'video') từ pg_uuid.
	 * Trả về null nếu dsps_report chưa được assign (pg_uuid rỗng) — caller
	 * dùng `dryRun` giống report-import-worker để không insert bậy vào Postgres.
	 * Pattern giống report-import-worker.service.ts (line 576-588).
	 */
	private async resolveDspContext(dspsReport: {
		id_dsps_report: string;
		pg_uuid: string | null;
	}): Promise<{ pgUuid: string | null; dspType: 'audio' | 'video' }> {
		if (!dspsReport.pg_uuid) {
			return { pgUuid: null, dspType: 'audio' };
		}
		const pgDsp = await this.dspMappingService.getPgDspsSyncByUuid(
			dspsReport.pg_uuid,
		);
		const dspType =
			((pgDsp?.type as string) || 'audio') === 'video'
				? 'video'
				: 'audio';
		return { pgUuid: dspsReport.pg_uuid, dspType };
	}

	private async resolveDspContextById(
		dspId: string,
	): Promise<{ pgUuid: string | null; dspType: 'audio' | 'video' }> {
		const dspsReport =
			await this.dspMappingService.getDspsReportById(dspId);
		if (!dspsReport) {
			return { pgUuid: null, dspType: 'audio' };
		}
		return this.resolveDspContext(dspsReport);
	}

	/**
	 * Gọi extractAndImport cho từng source_file trong batch — reuse cùng pattern
	 * mà report-import-worker.service.ts đang dùng (line 603-627):
	 *   - pg_uuid rỗng → dryRun = true (không insert vào Postgres, chỉ đếm)
	 *   - pg_uuid có → truyền dspType để phân biệt Track/Video
	 * Trả về entityResult aggregate cho buildResult.
	 */
	private async extractAndImportPerFile(
		allRows: Array<FactDspRow | FactSalesRow>,
		context: {
			folderName: string;
			batchId: string;
			dspsReport: { id_dsps_report: string; pg_uuid: string | null };
			resolveContextPerRowDsp?: boolean;
		},
	): Promise<{
		totalReleases: number;
		created: number;
		skipped: number;
		errors: number;
		inDb: number;
		pending: number;
	}> {
		const entityResult = {
			totalReleases: 0,
			created: 0,
			skipped: 0,
			errors: 0,
			inDb: 0,
			pending: 0,
		};

		const { pgUuid, dspType } = await this.resolveDspContext(
			context.dspsReport,
		);
		const dryRun = !pgUuid;
		if (context.resolveContextPerRowDsp) {
			this.logger.log(
				`[${context.folderName}] Importing release metadata per row dsp_id.`,
			);
		} else if (dryRun) {
			this.logger.log(
				`[${context.folderName}] Skipping Postgres metadata import (pg_uuid rỗng — dsps_report chưa assign). Chỉ đếm pending.`,
			);
		} else {
			this.logger.log(
				`[${context.folderName}] Importing release metadata to Postgres (dspType=${dspType}, pg_uuid=${pgUuid}).`,
			);
		}

		for (const [sourceFileName, rows] of this.groupRowsBySourceFile(
			allRows,
		)) {
			const rowGroups = new Map<
				string,
				Array<FactDspRow | FactSalesRow>
			>();
			if (context.resolveContextPerRowDsp) {
				for (const row of rows) {
					const dspId =
						row.dsp_id?.trim() || context.dspsReport.id_dsps_report;
					const group = rowGroups.get(dspId) ?? [];
					group.push(row);
					rowGroups.set(dspId, group);
				}
			} else {
				rowGroups.set(context.dspsReport.id_dsps_report, rows);
			}

			for (const [dspId, dspRows] of rowGroups) {
				const currentContext = context.resolveContextPerRowDsp
					? await this.resolveDspContextById(dspId)
					: { pgUuid, dspType };
				const currentDryRun = !currentContext.pgUuid;

				const res = await this.reportEntityExtractorService
					.extractAndImport(
						dspRows,
						undefined,
						undefined,
						undefined,
						{
							sourceType: ImportJobSourceType.FTP_SYNC_PERIOD,
							parserCode: context.folderName,
							fileName: sourceFileName,
							jobId: context.batchId,
							dspType: currentContext.dspType,
							dryRun: currentDryRun,
						},
					)
					.catch((err: any) => {
						this.logger.error(
							`[${context.folderName}] extractAndImport failed for ${sourceFileName}: ${err.message}`,
							err.stack,
						);
						return {
							totalReleases: 0,
							created: 0,
							skipped: 0,
							errors: 1,
							inDb: 0,
							pending: 0,
						};
					});

				entityResult.totalReleases += res.totalReleases;
				entityResult.created += res.created;
				entityResult.skipped += res.skipped;
				entityResult.errors += res.errors;
				entityResult.inDb += res.inDb;
				entityResult.pending += res.pending;
			}
		}

		return entityResult;
	}

	private isRevelatorSalesFolder(folderName: string): boolean {
		return (
			folderName === 'rev-revelator' || folderName.split('-')[0] === 'rev'
		);
	}

	private async resolveRevelatorDspReportId(
		row: FactSalesRow,
		folderName: string,
	): Promise<string> {
		const serviceName = hasMeaningfulText(row.service_name)
			? row.service_name.trim()
			: folderName;
		const dspsReport =
			await this.dspMappingService.resolveOrCreateDspReport(
				serviceName,
				REVELATOR_IMPORT_SOURCE,
			);
		return dspsReport.id_dsps_report;
	}

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
		const dspFoldersToProcess: Array<{
			path: string;
			name: string;
			category?: string;
		}> = [];

		// Strategy 1: Check for trends/, usage/, sales/, illegitimate_activity/ subdirectories
		for (const subDir of [
			'trends',
			'usage',
			'sales',
			'illegitimate_activity',
		]) {
			const subPath = path.join(dataPath, subDir);
			if (fs.existsSync(subPath)) {
				const allDirs = fs
					.readdirSync(subPath, { withFileTypes: true })
					.filter((d) => d.isDirectory() && !d.name.startsWith('.'));
				for (const d of allDirs) {
					if (
						await this.excludePatternService.shouldExclude(
							d.name,
							'folder',
						)
					) {
						this.logger.log(
							`  ⛔ [EXCLUDED] Skip folder ${subDir}/${d.name} (matched exclude pattern)`,
						);
						continue;
					}
					dspFoldersToProcess.push({
						path: path.join(subPath, d.name),
						name: d.name,
						category: subDir,
					});
				}
			}
		}

		// Strategy 2: Check root dataPath for DSP folders directly (202205 style)
		const rootDirs = fs
			.readdirSync(dataPath, { withFileTypes: true })
			.filter(
				(d) =>
					d.isDirectory() &&
					d.name !== 'trends' &&
					d.name !== 'usage' &&
					!d.name.startsWith('.'),
			);
		for (const d of rootDirs) {
			if (
				await this.excludePatternService.shouldExclude(d.name, 'folder')
			) {
				this.logger.log(
					`  ⛔ [EXCLUDED] Skip folder ${d.name} (matched exclude pattern)`,
				);
				continue;
			}
			dspFoldersToProcess.push({
				path: path.join(dataPath, d.name),
				name: d.name,
			});
		}

		this.logger.log(
			`Found ${dspFoldersToProcess.length} DSP folders to process`,
		);

		for (const {
			path: dspPath,
			name: dspFolder,
			category,
		} of dspFoldersToProcess) {
			const dspResult = await this.importDspFolder(
				dspPath,
				dspFolder,
				batchId,
				category || '',
			);

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
		importSource: string = 'ftp',
		parserConfig?: ResolvedFtpParserConfig,
	): Promise<ImportResult['dspResults'][0] | null> {
		// Pre-load file exclude check once (avoids repeated async calls inside findDataFiles)
		const fileExcluder = async (name: string) =>
			this.excludePatternService.shouldExclude(name, 'file');

		// Route to the correct import method based on category
		if (sourceCategory === 'sales') {
			return this.importSalesDspFolder(
				folderPath,
				folderName,
				batchId,
				fileExcluder,
				importSource,
				parserConfig,
			);
		}
		if (sourceCategory === 'illegitimate_activity') {
			return this.importIllegitimateDspFolder(
				folderPath,
				folderName,
				batchId,
				fileExcluder,
				importSource,
				parserConfig,
			);
		}
		// Default: trends / usage → existing parsers → fact_dsp
		return this.importTrendsDspFolder(
			folderPath,
			folderName,
			batchId,
			sourceCategory,
			fileExcluder,
			importSource,
			parserConfig,
		);
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
		importSource: string,
		parserConfig?: ResolvedFtpParserConfig,
	): Promise<ImportResult['dspResults'][0] | null> {
		// Resolve or create dsps_report for this folder
		const dspsReport =
			parserConfig?.dspReport ??
			(await this.dspMappingService.resolveOrCreateDspReport(
				folderName,
				importSource === 'ftp' ? 'ftp_folder' : importSource,
			));

		const parser: any =
			parserConfig?.parser ?? getParserForFolder(folderName);
		if (!parser) {
			this.logger.warn(`No trends parser for folder: ${folderName}`);
			return null;
		}

		const startTime = Date.now();
		this.logger.log(
			`Parsing DSP folder: ${folderName} (${sourceCategory || 'trends'})`,
		);
		const files = await this.findDataFiles(folderPath, fileExcluder);
		const allRows: FactDspRow[] = [];
		const allFileStats: ParseFileStats[] = [];

		for (const filePath of files) {
			try {
				const { rows, stats } = await parser.parseFileWithStats(filePath, batchId);
				allFileStats.push(stats);
				const sourceFileName = path.basename(filePath);
				for (const row of rows) {
					if (sourceCategory) {
						row.source_category = sourceCategory;
					}
					row.dsp_id = dspsReport.id_dsps_report;
					row.import_source = importSource;
					row.source_file_name = sourceFileName;
					normalizeFactRows([row]);
				}
				allRows.push(...rows);
			} catch (err) {
				this.logger.error(
					`Error parsing ${path.basename(filePath)}: ${err.message}`,
				);
			}
		}

		let entityResult:
			| Awaited<ReturnType<ImportService['extractAndImportPerFile']>>
			| undefined;
		if (allRows.length > 0) {
			try {
				await this.clickHouseService.insertBatched(
					CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT,
					allRows as unknown as Record<string, unknown>[],
					50_000,
				);
			} catch (err) {
				this.logger.error(
					`Bulk insert failed for ${folderName}: ${err.message}`,
				);
			}

			// Import metadata (Release/Track/Video) sang Postgres giống report-import.
			entityResult = await this.extractAndImportPerFile(allRows, {
				folderName,
				batchId,
				dspsReport,
			});

			// Refresh materialized stats cho các dsp_id vừa nạp thêm data.
			this.refreshStatsAfterImport(allRows, folderName);
		}

		return this.buildResult(
			folderName,
			files,
			allRows.length,
			startTime,
			entityResult,
			allFileStats,
		);
	}

	/**
	 * Import sales data → fact_sales_report (new table).
	 */
	private async importSalesDspFolder(
		folderPath: string,
		folderName: string,
		batchId: string,
		fileExcluder: (name: string) => Promise<boolean>,
		importSource: string,
		parserConfig?: ResolvedFtpParserConfig,
	): Promise<ImportResult['dspResults'][0] | null> {
		const isRevelator = this.isRevelatorSalesFolder(folderName);

		const dspsReport: { id_dsps_report: string; pg_uuid: string | null } =
			parserConfig?.dspReport ??
			(isRevelator
				? { id_dsps_report: '', pg_uuid: null }
				: await this.dspMappingService.resolveOrCreateDspReport(
						folderName,
						importSource === 'ftp' ? 'ftp_folder' : importSource,
					));

		const parser: any =
			parserConfig?.parser ?? getSalesParserForFolder(folderName);
		if (!parser) {
			this.logger.warn(
				`⚠️ [UNKNOWN DSP] No sales parser found for folder: "${folderName}" — data skipped. Please add a parser for this DSP.`,
			);
			return null;
		}

		const startTime = Date.now();
		this.logger.log(`Parsing SALES folder: ${folderName}`);
		const files = await this.findDataFiles(folderPath, fileExcluder);
		const allRows: FactSalesRow[] = [];
		const allFileStats: ParseFileStats[] = [];
		const parseErrors: string[] = [];

		for (const filePath of files) {
			try {
				const { rows, stats } = await parser.parseFileWithStats(filePath, batchId);
				allFileStats.push(stats);
				const sourceFileName = path.basename(filePath);
				// Replace dsp_id with id_dsps_report from dsps_report
				for (const row of rows) {
					row.dsp_id = isRevelator
						? await this.resolveRevelatorDspReportId(
								row,
								folderName,
							)
						: dspsReport.id_dsps_report;
					row.import_source = isRevelator
						? REVELATOR_IMPORT_SOURCE
						: importSource;
					row.source_file_name = sourceFileName;
					normalizeFactRows([row]);
				}
				allRows.push(...rows);
			} catch (err) {
				parseErrors.push(
					`${path.basename(filePath)}: ${err.message}`,
				);
				this.logger.error(
					`Error parsing sales ${path.basename(filePath)}: ${err.message}`,
				);
			}
		}

		// A folder with no successfully parsed file must not be recorded as
		// "done" with zero rows: otherwise the incremental sync will skip it on
		// subsequent runs even though none of its data was imported.
		if (files.length > 0 && parseErrors.length === files.length) {
			throw new Error(
				`Failed to parse every sales file in ${folderName}: ${parseErrors.join('; ')}`,
			);
		}

		let entityResult:
			| Awaited<ReturnType<ImportService['extractAndImportPerFile']>>
			| undefined;
		if (allRows.length > 0) {
			try {
				await this.clickHouseService.insertBatched(
					CLICKHOUSE_TABLES.FACT_SALES_REPORT,
					allRows as unknown as Record<string, unknown>[],
					50_000,
				);
			} catch (err) {
				this.logger.error(
					`Sales bulk insert failed for ${folderName}: ${err.message}`,
				);
			}

			// Import metadata (Release/Track/Video) sang Postgres giống report-import.
			entityResult = await this.extractAndImportPerFile(allRows, {
				folderName,
				batchId,
				dspsReport,
				resolveContextPerRowDsp: isRevelator,
			});

			// Refresh materialized stats cho các dsp_id vừa nạp thêm data.
			this.refreshStatsAfterImport(allRows, folderName);
		}

		return this.buildResult(
			folderName,
			files,
			allRows.length,
			startTime,
			entityResult,
			allFileStats,
		);
	}

	/**
	 * Import illegitimate data → fact_dsp_comprehensive_report (quantity_invalid).
	 */
	private async importIllegitimateDspFolder(
		folderPath: string,
		folderName: string,
		batchId: string,
		fileExcluder: (name: string) => Promise<boolean>,
		importSource: string,
		parserConfig?: ResolvedFtpParserConfig,
	): Promise<ImportResult['dspResults'][0] | null> {
		const prefix = folderName.split('-')[0];
		let parser: any = parserConfig?.parser;
		if (!parser) {
			if (prefix === 'dzr') parser = new DeezerIllegitimateParser();
			else if (prefix === 'scu')
				parser = new SoundCloudIllegitimateParser();
			else if (prefix === 'spo') parser = new SpotifyIllegitimateParser();
			else if (prefix === 'tiktok')
				parser = new TiktokIllegitimateParser();
		}
		if (!parser) {
			this.logger.warn(
				`No illegitimate parser for folder: ${folderName}`,
			);
			return null;
		}

		// Resolve or create dsps_report for this folder
		const dspsReport =
			parserConfig?.dspReport ??
			(await this.dspMappingService.resolveOrCreateDspReport(
				folderName,
				importSource === 'ftp' ? 'ftp_folder' : importSource,
			));

		const startTime = Date.now();
		this.logger.log(`Parsing ILLEGITIMATE folder: ${folderName}`);
		const files = await this.findDataFiles(folderPath, fileExcluder);
		const allRows: FactDspRow[] = [];
		const allFileStats: ParseFileStats[] = [];

		for (const filePath of files) {
			try {
				const { rows, stats } = await parser.parseFileWithStats(filePath, batchId);
				allFileStats.push(stats);
				const sourceFileName = path.basename(filePath);
				// Replace dsp_id with id_dsps_report
				for (const row of rows) {
					row.dsp_id = dspsReport.id_dsps_report;
					row.import_source = importSource;
					row.source_file_name = sourceFileName;
					normalizeFactRows([row]);
				}
				allRows.push(...rows);
			} catch (err) {
				this.logger.error(
					`Error parsing illegitimate ${path.basename(filePath)}: ${err.message}`,
				);
			}
		}

		let entityResult:
			| Awaited<ReturnType<ImportService['extractAndImportPerFile']>>
			| undefined;
		if (allRows.length > 0) {
			try {
				await this.clickHouseService.insertBatched(
					CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT,
					allRows as unknown as Record<string, unknown>[],
					50_000,
				);
			} catch (err) {
				this.logger.error(
					`Illegitimate bulk insert failed for ${folderName}: ${err.message}`,
				);
			}

			// Import metadata (Release/Track/Video) sang Postgres giống report-import.
			entityResult = await this.extractAndImportPerFile(allRows, {
				folderName,
				batchId,
				dspsReport,
			});

			// Refresh materialized stats cho các dsp_id vừa nạp thêm data.
			this.refreshStatsAfterImport(allRows, folderName);
		}

		return this.buildResult(
			folderName,
			files,
			allRows.length,
			startTime,
			entityResult,
			allFileStats,
		);
	}

	private buildResult(
		folderName: string,
		files: string[],
		totalRows: number,
		startTime: number,
		entityResult?: {
			totalReleases: number;
			created: number;
			skipped: number;
			errors: number;
			inDb: number;
			pending: number;
		},
		fileStats?: ParseFileStats[],
	): ImportResult['dspResults'][0] {
		const duration = Date.now() - startTime;
		this.logger.log(
			`${folderName}: ${totalRows} rows from ${files.length} files in ${duration}ms`,
		);
		const dspName = folderName.includes('-')
			? folderName.split('-').slice(1).join('-')
			: folderName;
		return {
			dsp: dspName,
			folder: folderName,
			files: files.length,
			rows: totalRows,
			durationMs: duration,
			fileNames: files.map((f) => path.basename(f)),
			fileStats,
			releases: entityResult
				? {
						totalReleases: entityResult.totalReleases,
						created: entityResult.created,
						skipped: entityResult.skipped,
						errors: entityResult.errors,
						inDb: entityResult.inDb,
						pending: entityResult.pending,
					}
				: null,
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
				results.push(
					...(await this.findDataFiles(fullPath, fileExcluder)),
				);
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
						this.logger.debug(
							`  ⛔ [EXCLUDED] Skip file ${entry.name} (matched exclude pattern)`,
						);
						continue;
					}
					fileNames.add(entry.name);
					results.push(fullPath);
				}
			}
		}

		// Remove uncompressed files if .gz version exists (avoid double import)
		return results
			.filter((f) => {
				const name = path.basename(f);
				if (!name.endsWith('.gz') && fileNames.has(name + '.gz')) {
					return false; // Skip — .gz version will be imported instead
				}
				return true;
			})
			.sort();
	}
}
