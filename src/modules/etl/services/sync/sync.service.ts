import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CLICKHOUSE_TABLES, ClickHouseService } from '../../../clickhouse';
import { FtpSourceCategory } from '../../../dsp-report/dto/ftp-parser-config.dto';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';
import {
	FtpParserConfigService,
	ResolvedFtpParserConfig,
} from '../../../dsp-report/services/ftp-parser-config.service';
import { FtpReportFileRuleService } from '../../../dsp-report/services/ftp-report-file-rule.service';
import { UpdateSyncConfigDto } from '../../dto/sync-config.dto';
import { ImportJobSourceType } from '../../interfaces';
import { AnalyticsProjectionRefreshService } from '../cube-rebuild/analytics-projection-refresh.service';
import { EtlImportHistoryRepository } from '../etl-import-history/etl-import-history.repository';
import {
	FtpAuthenticationError,
	FtpService,
	FtpSession,
	isFtpDisconnectError,
} from '../ftp/ftp.service';
import { ImportService } from '../import/import.service';

export interface SyncConfig {
	mode: string;
	cron: string;
	startPeriod?: string;
	categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>;
	force: boolean;
	excludeEnabled: boolean;
	maxRetries?: number;
}

export interface SyncPeriodResult {
	period: string;
	categories: Array<{
		category: string;
		folders: Array<{
			dsp_folder: string;
			status: 'done' | 'skipped' | 'error' | 'updated';
			rows: number;
			files: number;
			durationMs: number;
			ignoredFilesCleaned?: number;
			error?: string;
			reason?: string;
			releases?: {
				total: number;
				imported: number;
				skipped: number;
				errors: number;
				inDb: number;
				pending: number;
			} | null;
		}>;
	}>;
	totalRows: number;
	totalFiles: number;
	durationMs: number;
	releases?: {
		total: number;
		imported: number;
		skipped: number;
		errors: number;
		inDb: number;
		pending: number;
	};
}

export interface ImportHistoryRow {
	id: string;
	job_id: string;
	batch_id: string;
	period: string;
	source_type: string;
	category: string;
	dsp_folder: string;
	file_name: string;
	file_directory: string;
	file_path: string;
	status: string;
	total_lines: string;
	processed_rows: string;
	skipped_rows: string;
	error_rows: string;
	duration_ms: string;
	error_message: string;
	started_at: string;
	completed_at: string;
}

@Injectable()
export class SyncService {
	private readonly logger = new Logger(SyncService.name);
	private readonly tempBaseDir = path.join(os.tmpdir(), 'etl-import');
	/** Cache: folder name (lowercase) → dsps_report UUID, cleared per syncPeriod call */
	private dspIdCache = new Map<string, string>();

	constructor(
		private readonly ftpService: FtpService,
		private readonly importService: ImportService,
		private readonly clickHouseService: ClickHouseService,
		@InjectRedis() private readonly redis: Redis,
		private readonly excludePatternService: ExcludePatternService,
		private readonly analyticsProjectionRefreshService: AnalyticsProjectionRefreshService,
		private readonly ftpParserConfigService: FtpParserConfigService,
		private readonly ftpReportFileRuleService: FtpReportFileRuleService,
		private readonly etlImportHistoryRepository: EtlImportHistoryRepository,
	) {}

	// ── Tracking helpers ─────────────────────────────────

	/**
	 * Get import history for all periods, or filter by period.
	 * Uses FINAL to deduplicate ReplacingMergeTree rows.
	 */
	async getImportHistory(period?: string): Promise<ImportHistoryRow[]> {
		let where = '';
		const params: Record<string, unknown> = {};

		if (period) {
			where = `WHERE period = {period:String}`;
			params.period = period;
		}

		const sql = `
      SELECT *
      FROM etl_import_history FINAL
      ${where}
      ORDER BY period DESC, category, dsp_folder
    `;
		return this.clickHouseService.query<ImportHistoryRow>(sql, params);
	}

	/**
	 * Public wrapper for manual import flows (e.g. statements upload).
	 * Deletes sales fact data for a given (period YYYYMM, dsp folder) before re-import.
	 */
	async deleteDataForManualImport(
		period: string,
		dspFolder: string,
	): Promise<void> {
		await this.deleteFolderData(period, 'sales', dspFolder);
	}

	/**
	 * Get detailed import info for change detection.
	 * Returns a Map of "period|category|dsp_folder" → { status, files_list }
	 * Built from the latest state of each file. An `ignored` tombstone removes only
	 * that file from the manifest, so a later automatic sync will not import it again.
	 */
	private async getImportedDetails(): Promise<
		Map<
			string,
			{
				status: string;
				files_list: string[];
				file_manifest: string[];
				parser_config_version: number;
			}
		>
	> {
		const sql = `
      WITH latest_file_state AS (
        SELECT
          period,
          category,
          dsp_folder,
          file_name,
          argMax(status, tuple(completed_at, started_at, id)) AS status
        FROM etl_import_history FINAL
        WHERE source_type IN ('FTP_SYNC_PERIOD', 'FTP_SYNC_ALL', 'FTP_RETRY', 'FTP_AUTO_CRON')
        GROUP BY period, category, dsp_folder, file_name
      )
      SELECT
        period,
        category,
        dsp_folder,
        'done' AS status,
        groupArray(file_name) AS files_list
      FROM latest_file_state
      WHERE status = 'done'
      GROUP BY period, category, dsp_folder
    `;
		const rows = await this.clickHouseService.query<{
			period: string;
			category: string;
			dsp_folder: string;
			status: string;
			files_list: string[];
		}>(sql);

		const map = new Map<
			string,
			{
				status: string;
				files_list: string[];
				file_manifest: string[];
				parser_config_version: number;
			}
		>();
		for (const r of rows) {
			map.set(`${r.period}|${r.category}|${r.dsp_folder}`, {
				status: r.status,
				files_list: r.files_list || [],
				file_manifest: r.files_list || [],
				parser_config_version: 0,
			});
		}
		return map;
	}

	/**
	 * Delete fact data for a specific (period, category, dsp_folder) combination.
	 * This allows precise re-import without affecting other folders.
	 * Cube projections are refreshed once after the replacement import succeeds.
	 */
	private escapeSqlString(value: string): string {
		return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	}

	private async getFolderFactScope(
		period: string,
		category: string,
		dspFolder: string,
	): Promise<{ table: string; where: string }> {
		const periodStart = `${period.substring(0, 4)}-${period.substring(4, 6)}-01`;
		const dspName = dspFolder.includes('-')
			? dspFolder.split('-').slice(1).join('-')
			: dspFolder;

		// Resolve UUID for this dspFolder from dsps_report (use cache to avoid repeated queries)
		let resolvedDspId = this.dspIdCache.get(dspFolder.toLowerCase()) ?? '';
		if (!resolvedDspId) {
			try {
				const rows = await this.clickHouseService.query<{
					id_dsps_report: string;
				}>(
					`SELECT id_dsps_report FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} WHERE lower(dsp_name) = {folder: String} LIMIT 1`,
					{ folder: dspFolder.toLowerCase() },
				);
				if (rows.length > 0) {
					resolvedDspId = rows[0].id_dsps_report;
					this.dspIdCache.set(dspFolder.toLowerCase(), resolvedDspId);
				}
			} catch (err) {
				this.logger.warn(
					`Failed to resolve dsp_id UUID for folder ${dspFolder}: ${err.message}`,
				);
			}
		}

		// Build unique list of possible dsp_id values (legacy name, short name, UUID)
		const ids = new Set([dspFolder]);
		if (dspName) ids.add(dspName);
		if (resolvedDspId) ids.add(resolvedDspId);
		const dspIdsInSql = [...ids]
			.map((id) => `'${this.escapeSqlString(id)}'`)
			.join(', ');

		const table =
			category === 'sales'
				? CLICKHOUSE_TABLES.FACT_SALES_REPORT
				: CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT;
		const dateCol =
			category === 'sales'
				? 'reporting_period_start'
				: 'reporting_period';
		const catFilter =
			category === 'sales'
				? ''
				: `AND source_category = '${category === 'illegitimate_activity' ? 'illegitimate' : category}' `;

		const dateRange = `>= '${periodStart}' AND ${dateCol} < addMonths(toDate('${periodStart}'), 1)`;

		return {
			table,
			where: `${dateCol} ${dateRange} ${catFilter}AND dsp_id IN (${dspIdsInSql})`,
		};
	}

	/**
	 * Delete fact data for a specific (period, category, dsp_folder) combination.
	 * FTP callers must pass their source marker so they cannot erase data imported
	 * by WMG, Spotify, statements, or another source.
	 */
	private async deleteFolderData(
		period: string,
		category: string,
		dspFolder: string,
		importSources?: string[],
	): Promise<void> {
		const { table, where } = await this.getFolderFactScope(
			period,
			category,
			dspFolder,
		);
		const sourceFilter = importSources?.length
			? ` AND import_source IN (${importSources
					.map((source) => `'${this.escapeSqlString(source)}'`)
					.join(', ')})`
			: '';

		await this.clickHouseService.execute(
			`ALTER TABLE music_analytics.${table} DELETE WHERE ${where}${sourceFilter}`,
		);
		await this.clickHouseService.waitForTableMutations(table);
		this.logger.log(
			`  🗑️ Deleted old fact data for ${category}/${dspFolder} in ${period}`,
		);
	}

	private async getFtpFolderFactFiles(
		period: string,
		category: string,
		dspFolder: string,
	): Promise<{ fileNames: string[]; unattributableRows: number }> {
		const { table, where } = await this.getFolderFactScope(
			period,
			category,
			dspFolder,
		);
		const rows = await this.clickHouseService.query<{
			source_file_name: string;
			row_count: string;
		}>(`
      SELECT source_file_name, count() AS row_count
      FROM music_analytics.${table}
      WHERE ${where} AND import_source IN ('ftp', '')
      GROUP BY source_file_name
    `);

		return {
			fileNames: rows
				.map((row) => row.source_file_name)
				.filter((fileName) => Boolean(fileName)),
			unattributableRows: rows
				.filter((row) => !row.source_file_name)
				.reduce((total, row) => total + Number(row.row_count), 0),
		};
	}

	private async deleteIgnoredFtpFolderFiles(
		period: string,
		category: string,
		dspFolder: string,
		fileNames: string[],
	): Promise<number> {
		const uniqueFileNames = [...new Set(fileNames)].filter(Boolean);
		if (uniqueFileNames.length === 0) return 0;

		const { table, where } = await this.getFolderFactScope(
			period,
			category,
			dspFolder,
		);
		const fileNamesSql = uniqueFileNames
			.map((fileName) => `'${this.escapeSqlString(fileName)}'`)
			.join(', ');
		const countRows = await this.clickHouseService.query<{
			row_count: string;
		}>(`
      SELECT count() AS row_count
      FROM music_analytics.${table}
      WHERE ${where}
        AND import_source IN ('ftp', '')
        AND source_file_name IN (${fileNamesSql})
    `);
		const deletedRows = Number(countRows[0]?.row_count ?? 0);
		if (deletedRows === 0) return 0;

		await this.clickHouseService.execute(
			`ALTER TABLE music_analytics.${table} DELETE WHERE ${where} AND import_source IN ('ftp', '') AND source_file_name IN (${fileNamesSql})`,
		);
		await this.clickHouseService.waitForTableMutations(table);
		this.logger.log(
			`  Removed ${deletedRows} FTP fact row(s) for ${uniqueFileNames.length} ignored file(s) in ${category}/${dspFolder}/${period}`,
		);
		return deletedRows;
	}

	private async writeIgnoredFileHistory(
		period: string,
		category: string,
		dspFolder: string,
		batchId: string,
		jobId: string | undefined,
		fileNames: string[],
		sourceType: ImportJobSourceType,
	): Promise<void> {
		for (const fileName of [...new Set(fileNames)].filter(Boolean)) {
			await this.etlImportHistoryRepository.upsert({
				job_id: jobId ?? batchId,
				batch_id: batchId,
				period,
				source_type: sourceType,
				category,
				dsp_folder: dspFolder,
				file_name: fileName,
				file_directory: `${category}/${period}/${dspFolder}`,
				file_path: `${category}/${period}/${dspFolder}/${fileName}`,
				status: 'ignored',
				error_message:
					'Removed by force sync because FTP report file rule is ignore',
			});
		}
	}

	// ── Sync operations ───────────────────────────────────

	/**
	 * Sync a single period from FTPS.
	 *
	 * Smart incremental sync:
	 * 1. For each DSP folder, compare FTP file list vs previously imported files_list
	 * 2. If file lists match → skip (no new data)
	 * 3. If FTP has new files → delete old data + re-import all (prevents duplicates)
	 * 4. New folders (never imported) → import normally
	 */
	async syncPeriod(
		period: string,
		force?: boolean,
		categories?: Array<
			'trends' | 'usage' | 'sales' | 'illegitimate_activity'
		>,
		jobId?: string,
		session?: FtpSession,
		sourceType: ImportJobSourceType = ImportJobSourceType.FTP_SYNC_PERIOD,
	): Promise<SyncPeriodResult> {
		// A period can be called on its own or as part of a range/auto-sync. In
		// the latter case the caller owns the leased connection, so every DSP is
		// still checked but does not cause another FTP login.
		if (!session) {
			return this.ftpService.withSession(
				(ownedSession) =>
					this.syncPeriod(
						period,
						force,
						categories,
						jobId,
						ownedSession,
						sourceType,
					),
				'sync-period',
			);
		}

		const config = await this.getSyncConfig();
		const resolvedForce = force ?? config.force;
		const resolvedCategories =
			categories && categories.length > 0
				? categories
				: config.categories || [
						'trends',
						'usage',
						'sales',
						'illegitimate_activity',
					];

		const batchId = uuidv4();
		const startTime = Date.now();
		this.logger.log(
			`Starting FTPS period sync for ${period}, batch ${batchId}`,
		);

		// Clear UUID lookup cache for this sync batch
		this.dspIdCache.clear();

		// Get detailed import history (includes files_list for change detection)
		const importedDetails = await this.getImportedDetails();

		this.logger.log(
			`Syncing period ${period} (force=${resolvedForce}, categories=${resolvedCategories.join(',')}), batch ${batchId}`,
		);

		const result: SyncPeriodResult = {
			period,
			categories: [],
			totalRows: 0,
			totalFiles: 0,
			durationMs: 0,
			releases: {
				total: 0,
				imported: 0,
				skipped: 0,
				errors: 0,
				inDb: 0,
				pending: 0,
			},
		};
		const affectedSalesPeriods = new Set<string>();
		const affectedTrendsPeriods = new Set<string>();
		const registerAffectedPeriod = (category: string) => {
			if (category === 'sales') affectedSalesPeriods.add(period);
			else affectedTrendsPeriods.add(period);
		};

		const categoriesToSync = resolvedCategories;

		for (const category of categoriesToSync) {
			const rawFolders = await this.ftpService.listDspFolders(
				category,
				period,
				session,
			);

			// Lọc folder bị exclude theo config
			const dspFolders: string[] = [];
			for (const f of rawFolders) {
				if (
					await this.excludePatternService.shouldExclude(f, 'folder')
				) {
					this.logger.log(
						`  ⛔ [EXCLUDED] Skip folder ${category}/${f} (matched exclude pattern)`,
					);
				} else {
					dspFolders.push(f);
				}
			}

			if (dspFolders.length === 0) {
				this.logger.log(`  No ${category}/${period} on FTPS`);
				continue;
			}

			const categoryResult: SyncPeriodResult['categories'][0] = {
				category,
				folders: [],
			};

			const dspRetryAttempts = Math.max(1, config.maxRetries ?? 3);
			folderLoop: for (const dspFolder of dspFolders) {
				const key = `${period}|${category}|${dspFolder}`;
				const existing = importedDetails.get(key);
				let parserConfig: ResolvedFtpParserConfig;
				let ignoredFilesCleaned = 0;
				let availableFiles: string[] = [];
				for (
					let dspAttempt = 1;
					dspAttempt <= dspRetryAttempts;
					dspAttempt++
				) {
				try {
					availableFiles = await this.ftpService.listRemoteFiles(
						category,
						period,
						dspFolder,
						undefined,
						true,
						session,
					);
					const ruleDecision =
						await this.ftpReportFileRuleService.resolveFiles(
							'ftp',
							category as FtpSourceCategory,
							dspFolder,
							availableFiles,
						);
					if (ruleDecision.pending.length) {
						this.logger.warn(
							`FTP rules pending confirmation for ${category}/${dspFolder}: ${ruleDecision.pending.length} file(s)`,
						);
					}
					// A rule may have changed from import to ignore after its file was
					// already imported. During a force sync, reconcile those historical
					// FTP rows before the normal early-return for "no import rule".
					if (resolvedForce) {
						const trackedFiles = await this.getFtpFolderFactFiles(
							period,
							category,
							dspFolder,
						);
						if (trackedFiles.unattributableRows > 0) {
							this.logger.warn(
								`Cannot safely reconcile ${trackedFiles.unattributableRows} legacy FTP fact row(s) without source_file_name in ${category}/${dspFolder}/${period}`,
							);
						}
						const historicalRuleDecision =
							await this.ftpReportFileRuleService.resolveFiles(
								'ftp',
								category as FtpSourceCategory,
								dspFolder,
								trackedFiles.fileNames,
							);
						const ignoredHistoricalFiles =
							historicalRuleDecision.ignored;
						if (ignoredHistoricalFiles.length > 0) {
							const deletedRows =
								await this.deleteIgnoredFtpFolderFiles(
									period,
									category,
									dspFolder,
									ignoredHistoricalFiles,
								);
							await this.writeIgnoredFileHistory(
								period,
								category,
								dspFolder,
								batchId,
								jobId,
								ignoredHistoricalFiles,
								sourceType,
							);
							ignoredFilesCleaned = ignoredHistoricalFiles.length;
							if (deletedRows > 0)
								registerAffectedPeriod(category);
						}
					}
					if (
						!ruleDecision.selected.length ||
						!ruleDecision.parserCode
					) {
						categoryResult.folders.push({
							dsp_folder: dspFolder,
							status: 'skipped',
							rows: 0,
							files: 0,
							durationMs: 0,
							ignoredFilesCleaned:
								ignoredFilesCleaned || undefined,
							reason: ruleDecision.pending.length
								? 'files pending admin confirmation'
								: ignoredFilesCleaned
									? `${ignoredFilesCleaned} ignored file(s) removed by force sync`
									: 'no import rule matched files',
						});
						continue folderLoop;
					}
					parserConfig =
						await this.ftpParserConfigService.resolveForParserCode(
							dspFolder,
							category as FtpSourceCategory,
							ruleDecision.parserCode,
						);
					const selectedNames = new Set(ruleDecision.selected);
					parserConfig.selectFile = (path) => selectedNames.has(path);
				} catch (err) {
					if (err instanceof FtpAuthenticationError) throw err;
					if (
						isFtpDisconnectError(err) &&
						dspAttempt < dspRetryAttempts
					) {
						session.invalidate();
						this.logger.warn(
							`FTP disconnected listing ${category}/${dspFolder}; retrying DSP (${dspAttempt}/${dspRetryAttempts}): ${err.message}`,
						);
						continue;
					}
					this.logger.error(
						`Invalid parser config for ${category}/${dspFolder}: ${err.message}`,
					);
					categoryResult.folders.push({
						dsp_folder: dspFolder,
						status: 'error',
						rows: 0,
						files: 0,
						durationMs: 0,
						error: err.message,
					});
					continue folderLoop;
				}
				// The first recursive listing above is authoritative for this DSP.
				// Filtering it locally avoids walking the same remote tree a second
				// time before the download, while preserving the manifest check.
				const remoteFiles = availableFiles.filter((file) =>
					parserConfig.selectFile(file),
				);
				if (remoteFiles.length === 0) {
					this.logger.warn(
						`No files matched parser config for ${category}/${dspFolder}`,
					);
					categoryResult.folders.push({
						dsp_folder: dspFolder,
						status: 'skipped',
						rows: 0,
						files: 0,
						durationMs: 0,
						reason: 'no files matched parser config',
					});
					continue folderLoop;
				}

				// ── Change detection: compare file lists ──
				if (existing && existing.status === 'done') {
					if (resolvedForce) {
						// Delete old data for this specific folder before re-import
						await this.deleteFolderData(
							period,
							category,
							dspFolder,
							['ftp', ''],
						);
						registerAffectedPeriod(category);
					} else {
						const previousFiles = (
							existing.file_manifest ||
							existing.files_list ||
							[]
						).sort();

						// Compare: if identical → skip
						const filesMatch =
							remoteFiles.length === previousFiles.length &&
							remoteFiles.every((f, i) => f === previousFiles[i]);

						if (filesMatch) {
							this.logger.log(
								`  ✅ ${category}/${dspFolder} — ${remoteFiles.length} files unchanged, skip`,
							);
							categoryResult.folders.push({
								dsp_folder: dspFolder,
								status: 'skipped',
								rows: 0,
								files: 0,
								durationMs: 0,
								reason: 'files unchanged',
							});
							continue folderLoop;
						}

						// Files differ → need re-sync
						const newFiles = remoteFiles.filter(
							(f) => !previousFiles.includes(f),
						);
						this.logger.log(
							`  🔄 ${category}/${dspFolder} — ${newFiles.length} new files detected ` +
								`(FTP: ${remoteFiles.length}, imported: ${previousFiles.length}, config v${parserConfig.configVersion}). Re-syncing...`,
						);

						// Delete old data for this specific folder before re-import
						await this.deleteFolderData(
							period,
							category,
							dspFolder,
							['ftp', ''],
						);
						registerAffectedPeriod(category);
					}
				}

				// ── Download + import ──
				const folderStart = Date.now();
				const isUpdate = existing && existing.status === 'done';
				try {
					// Download from FTPS
					const { localPath, fileCount } =
						await this.ftpService.downloadDspFolder(
							period,
							category,
							dspFolder,
							this.tempBaseDir,
							parserConfig.selectFile,
							session,
						);

					// Parse using existing import service
					const dspResult = await this.importService.importDspFolder(
						localPath,
						dspFolder,
						batchId,
						category,
						'ftp',
						parserConfig,
					);

					// If no parser found, log and skip
					if (!dspResult) {
						this.logger.warn(
							`  ⚠️ [UNKNOWN DSP] No parser for ${category}/${dspFolder} — skipping`,
						);
						categoryResult.folders.push({
							dsp_folder: dspFolder,
							status: 'skipped',
							rows: 0,
							files: 0,
							durationMs: Date.now() - folderStart,
							reason: `no parser for ${category}`,
						});
						this.ftpService.cleanupTemp(localPath);
						continue folderLoop;
					}

					const rows = dspResult.rows || 0;
					const files = dspResult.files || 0;
					const fileNames = remoteFiles;
					const durationMs = Date.now() - folderStart;

					// Write per-file records to etl_import_history
					if (jobId && dspResult.fileStats?.length) {
						for (const stat of dspResult.fileStats) {
							await this.etlImportHistoryRepository
								.upsert({
									job_id: jobId,
									batch_id: batchId,
									period,
									source_type: sourceType,
									category,
									dsp_folder: dspFolder,
									file_name: stat.fileName,
									file_directory: `${category}/${period}/${dspFolder}`,
									file_path: `${category}/${period}/${dspFolder}/${stat.fileName}`,
									status: 'done',
									file_size_bytes: stat.fileSizeBytes,
									total_lines: stat.totalLines,
									processed_rows: stat.processedRows,
									skipped_rows: stat.skippedRows,
									error_rows: stat.errorRows,
									duration_ms: durationMs,
								})
								.catch((err) =>
									this.logger.warn(
										`Failed to write etl_import_history for ${stat.fileName}: ${err.message}`,
									),
								);
						}
					}

					// Cleanup temp
					this.ftpService.cleanupTemp(localPath);

					const releases =
						dspResult && dspResult.releases
							? {
									total: dspResult.releases.totalReleases,
									imported: dspResult.releases.created,
									skipped: dspResult.releases.skipped,
									errors: dspResult.releases.errors,
									inDb: dspResult.releases.inDb,
									pending: dspResult.releases.pending,
								}
							: null;

					categoryResult.folders.push({
						dsp_folder: dspFolder,
						status: isUpdate ? 'updated' : 'done',
						rows,
						files,
						durationMs,
						reason: isUpdate ? 'new files detected' : undefined,
						releases,
					});

					if (dspResult && dspResult.releases) {
						result.releases!.total +=
							dspResult.releases.totalReleases;
						result.releases!.imported += dspResult.releases.created;
						result.releases!.skipped += dspResult.releases.skipped;
						result.releases!.errors += dspResult.releases.errors;
						result.releases!.inDb += dspResult.releases.inDb;
						result.releases!.pending += dspResult.releases.pending;
					}

					result.totalRows += rows;
					result.totalFiles += files;
					if (rows > 0) registerAffectedPeriod(category);

					this.logger.log(
						`  ${isUpdate ? '🔄' : '✅'} ${category}/${dspFolder}: ${rows} rows, ${files} files (${durationMs}ms)` +
							(isUpdate ? ' [UPDATED]' : ''),
					);
					continue folderLoop;
				} catch (err) {
					if (err instanceof FtpAuthenticationError) throw err;
					if (
						isFtpDisconnectError(err) &&
						dspAttempt < dspRetryAttempts
					) {
						session.invalidate();
						this.logger.warn(
							`FTP disconnected on ${category}/${dspFolder}; retrying DSP (${dspAttempt}/${dspRetryAttempts}): ${err.message}`,
						);
						continue;
					}
					const durationMs = Date.now() - folderStart;

					categoryResult.folders.push({
						dsp_folder: dspFolder,
						status: 'error',
						rows: 0,
						files: 0,
						durationMs,
						error: err.message,
					});

					this.logger.error(
						`  ❌ ${category}/${dspFolder}: ${err.message}`,
					);
					continue folderLoop;
				}
				}
			}

			result.categories.push(categoryResult);
		}

		result.durationMs = Date.now() - startTime;
		this.logger.log(
			`Period ${period} sync done: ${result.totalRows} rows, ${result.totalFiles} files (${result.durationMs}ms)`,
		);

		// Rebuild each affected partition only after every fact write for this period.
		// This keeps cubes correct for both fresh imports and replacement imports.
		if (affectedSalesPeriods.size || affectedTrendsPeriods.size) {
			await this.analyticsProjectionRefreshService.refreshAfterFactImport(
				{
					salesPeriods: affectedSalesPeriods,
					trendsPeriods: affectedTrendsPeriods,
				},
			);

			try {
				const keys = await this.redis.keys('analytics:*');
				if (keys.length > 0) {
					await this.redis.del(...keys);
				}
				this.logger.log(
					`Cache invalidated: ${keys.length} keys matching 'analytics:*'`,
				);
			} catch (err) {
				this.logger.warn(`Cache invalidation failed: ${err.message}`);
			}
		}

		return result;
	}

	/**
	 * Sync ALL periods from FTPS.
	 * Each period is checked for new files — no data is missed even for "done" periods.
	 */
	async syncAll(
		force?: boolean,
		categories?: Array<
			'trends' | 'usage' | 'sales' | 'illegitimate_activity'
		>,
		session?: FtpSession,
		jobId?: string,
		sourceType: ImportJobSourceType = ImportJobSourceType.FTP_SYNC_ALL,
	): Promise<SyncPeriodResult[]> {
		if (!session) {
			return this.ftpService.withSession(
				(ownedSession) =>
					this.syncAll(
						force,
						categories,
						ownedSession,
						jobId,
						sourceType,
					),
				'sync-all',
			);
		}

		const config = await this.getSyncConfig();
		const periods = await this.ftpService.listPeriods(session);

		let filteredPeriods = periods;
		const startPeriod = config.startPeriod;
		if (startPeriod) {
			filteredPeriods = periods.filter((p) => p >= startPeriod);
			this.logger.log(
				`Filtering periods starting from ${startPeriod}. Remaining periods: ${filteredPeriods.join(', ')}`,
			);
		}

		const results: SyncPeriodResult[] = [];
		const resolvedForce = force ?? config.force;
		const resolvedCategories =
			categories && categories.length > 0
				? categories
				: config.categories;

		for (const period of filteredPeriods) {
			const result = await this.syncPeriod(
				period,
				resolvedForce,
				resolvedCategories,
				jobId,
				session,
				sourceType,
			);
			results.push(result);
		}

		return results;
	}

	/**
	 * Get sync status: which periods/folders are imported vs pending.
	 */
	async getStatus(): Promise<any> {
		// Listing every period and category over one login keeps a status check
		// from tripping the FTP server's login throttle.
		const ftpSession = this.ftpService.createSession('sync-status');
		try {
			const periods = await this.ftpService.listPeriods(ftpSession);
			const importedDetails = await this.getImportedDetails();
			const history = await this.getImportHistory();

			// Build history lookup: aggregate per (period|category|dsp_folder)
			// sum processed_rows, use latest completed_at
			const historyMap = new Map<
				string,
				ImportHistoryRow & { _totalRows: number }
			>();
			for (const row of history) {
				const key = `${row.period}|${row.category}|${row.dsp_folder}`;
				const existing = historyMap.get(key);
				if (!existing) {
					historyMap.set(key, {
						...row,
						_totalRows: Number(row.processed_rows),
					});
				} else {
					existing._totalRows += Number(row.processed_rows);
					if (row.completed_at > existing.completed_at) {
						existing.completed_at = row.completed_at;
						existing.status = row.status;
					}
				}
			}

			const result: any[] = [];

			for (const period of periods) {
				const periodData: any = { period, trends: null, usage: null };

				for (const category of ['trends', 'usage'] as const) {
					const folders = await this.ftpService.listDspFolders(
						category,
						period,
						ftpSession,
					);

					if (folders.length === 0) continue;

					const folderStatuses = folders.map((f) => {
						const key = `${period}|${category}|${f}`;
						const hist = historyMap.get(key);
						return {
							name: f,
							status: hist?.status || 'pending',
							rows: hist ? hist._totalRows : 0,
							files_imported: 0,
							imported_at: hist?.completed_at || null,
						};
					});

					const imported = folderStatuses.filter(
						(f) => f.status === 'done',
					).length;

					periodData[category] = {
						total: folders.length,
						imported,
						pending: folders.length - imported,
						folders: folderStatuses,
					};
				}

				result.push(periodData);
			}

			return { periods: result };
		} finally {
			ftpSession.close();
		}
	}

	// ── Config management ─────────────────────────────────

	async getSyncConfig(): Promise<SyncConfig> {
		const sql = `SELECT key, value FROM etl_config FINAL WHERE key IN (
      'sync_mode',
      'sync_cron',
      'sync_start_period',
      'sync_categories',
      'sync_force',
      'sync_exclude_enabled',
      'sync_max_retries'
    )`;
		const rows = await this.clickHouseService.query<{
			key: string;
			value: string;
		}>(sql);

		const config: Record<string, string> = {};
		for (const r of rows) {
			config[r.key] = r.value;
		}

		const categoriesRaw = config.sync_categories || '';
		const categories = categoriesRaw
			? (categoriesRaw.split(',').filter(Boolean) as Array<
					'trends' | 'usage' | 'sales' | 'illegitimate_activity'
				>)
			: undefined;

		return {
			mode: config.sync_mode || process.env.FTP_SYNC_MODE || 'manual',
			cron: config.sync_cron || process.env.FTP_SYNC_CRON || '0 2 * * *',
			startPeriod: config.sync_start_period || undefined,
			categories,
			force: config.sync_force === 'true',
			excludeEnabled: config.sync_exclude_enabled !== 'false',
			maxRetries: config.sync_max_retries
				? parseInt(config.sync_max_retries, 10)
				: undefined,
		};
	}

	async setSyncConfig(dto: UpdateSyncConfigDto): Promise<SyncConfig> {
		const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
		const rows: Array<Record<string, unknown>> = [];

		if (dto.mode !== undefined) {
			rows.push({ key: 'sync_mode', value: dto.mode, updated_at: now });
		}
		if (dto.cron !== undefined) {
			rows.push({ key: 'sync_cron', value: dto.cron, updated_at: now });
		}
		if (dto.startPeriod !== undefined) {
			rows.push({
				key: 'sync_start_period',
				value: dto.startPeriod,
				updated_at: now,
			});
		}
		if (dto.categories !== undefined) {
			rows.push({
				key: 'sync_categories',
				value: dto.categories.join(','),
				updated_at: now,
			});
		}
		if (dto.force !== undefined) {
			rows.push({
				key: 'sync_force',
				value: dto.force ? 'true' : 'false',
				updated_at: now,
			});
		}
		if (dto.excludeEnabled !== undefined) {
			rows.push({
				key: 'sync_exclude_enabled',
				value: dto.excludeEnabled ? 'true' : 'false',
				updated_at: now,
			});
		}
		if (dto.maxRetries !== undefined) {
			rows.push({
				key: 'sync_max_retries',
				value: String(dto.maxRetries),
				updated_at: now,
			});
		}

		if (rows.length > 0) {
			await this.clickHouseService.insert('etl_config', rows);
			this.logger.log(`Sync config updated: ${JSON.stringify(dto)}`);
		}

		return this.getSyncConfig();
	}
}
