import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { LRUCache } from 'lru-cache';
import * as os from 'os';
import * as path from 'path';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { isValidStandardUpc } from 'src/utils/upc.util';
import { zipFolder } from 'src/utils/util';
import { v4 as uuidv4 } from 'uuid';
import {
	AnalyticsReportExportDto,
	REPORTING_CURRENCIES,
	ReportingCurrency,
} from '../dto/analytics-report-export.dto';
import {
	AnalyticsReportExportResult,
	DetailRow,
	ExportProgressPatch,
	MetadataRow,
	RawDetailRow,
	SummaryRow,
} from '../interfaces/analytics-report-export.interface';
import {
	getRawDetailsPageQuery,
	getRawStatementDetailsPageQuery,
	getReleaseMetadataByUpcQuery,
	getTenantNamesQuery,
	getTrackMetadataQuery,
} from '../queries/analytics-report-export.queries';
import {
	getDedupedOwnershipSubquerySql,
	getOwnershipLedgerFallbackPredicate,
} from '../utils/ownership-join.util';
import {
	appendAnalyticsVideoScopeFilter,
	getAnalyticsVideoScope,
} from './analytics-video-scope.service';
import {
	GroupState,
	IStreamDetailWriter,
	SummaryAccumulator,
	createEmptyAccumulator,
	createStreamWriter,
	formatRevenueSum,
	multiplyDecimal,
	updateAccumulator,
} from './stream-detail-writer';

/** Lỗi báo job bị huỷ giữa chừng. */
export class ExportJobCancelledError extends Error {
	constructor(jobId: string) {
		super(`Export job ${jobId} was cancelled`);
		this.name = ExportJobCancelledError.name;
	}
}

export class MissingExchangeRateError extends Error {
	constructor(currency: string, months: string[]) {
		super(
			`Missing ${currency} exchange rate for month(s): ${months.join(', ')}`,
		);
		this.name = MissingExchangeRateError.name;
	}
}

/**
 * Dependencies mà ExportRunner cần, dạng interface thuần (không phụ thuộc Nest).
 * - Main thread: implement bằng các injected service (ClickHouseService, pg EntityManager, R2Service).
 * - Worker thread: implement bằng raw client (ClickHouse client, pg Pool, S3 client) dựng từ env.
 */
export interface ExportRunnerDeps {
	chQuery<T = Record<string, unknown>>(
		sql: string,
		params?: Record<string, unknown>,
	): Promise<T[]>;
	chQueryStream<T = Record<string, unknown>>(
		sql: string,
		params: Record<string, unknown> | undefined,
		onRows: (rows: T[]) => Promise<void> | void,
	): Promise<number>;
	pgQuery<T = any>(sql: string, params: unknown[]): Promise<T[]>;
	r2Upload(args: {
		key: string;
		filePath: string;
		contentType: string;
		isPublic?: boolean;
	}): Promise<unknown>;
	r2SignedUrlDown(args: {
		key: string;
		fileName: string;
		isPublic?: boolean;
	}): Promise<string>;
	/** Cập nhật fileName thật sau khi resolve tên workspace (optional). */
	updateFileName?(fileName: string): Promise<void>;
	/** Forward progress (main → SSE, hoặc worker → postMessage). */
	onProgress?(patch: ExportProgressPatch, force?: boolean): Promise<void>;
	/** Trả true nếu job đã bị huỷ → runner ném ExportJobCancelledError. */
	isCancelled?(): Promise<boolean>;
}

interface MissingCacheValue {
	missing: true;
}

const MISSING_CACHE_VALUE: MissingCacheValue = { missing: true };

interface MetadataCache {
	trackMeta: LRUCache<string, MetadataRow | MissingCacheValue>;
	releaseMeta: LRUCache<string, MetadataRow | MissingCacheValue>;
	tenantNames: LRUCache<string, string | MissingCacheValue>;
}

/**
 * ExportRunner — toàn bộ logic export analytics report, framework-agnostic.
 * Chỉ phụ thuộc các callback trong ExportRunnerDeps nên chạy được ở cả main
 * thread (Nest DI) lẫn worker_threads (raw clients).
 */
export class ExportRunner {
	private readonly sanitizedNamesCache = new Map<string, string>();
	private static readonly METADATA_WINDOW_SIZE = 20_000;
	private static readonly METADATA_QUERY_BATCH_SIZE = 5_000;
	private static readonly TRACK_METADATA_CACHE_SIZE = 50_000;
	private static readonly RELEASE_METADATA_CACHE_SIZE = 50_000;
	private static readonly TENANT_NAME_CACHE_SIZE = 10_000;
	private static readonly MAX_OPEN_CSV_WRITERS = 256;
	private static readonly PROGRESS_INTERVAL_MS = 2_000;
	/** Set only for a non-USD reporting export. USD leaves the streamed amount untouched. */
	private reportingRates: ReadonlyMap<string, string> | null = null;
	private reportingCurrency: ReportingCurrency = 'USD';

	constructor(
		private readonly deps: ExportRunnerDeps,
		private readonly jobId: string,
	) {}

	private async throwIfCancelled(): Promise<void> {
		if (this.deps.isCancelled && (await this.deps.isCancelled())) {
			throw new ExportJobCancelledError(this.jobId);
		}
	}

	async run(
		tenantId: string,
		dto: AnalyticsReportExportDto,
	): Promise<AnalyticsReportExportResult> {
		await this.throwIfCancelled();
		this.getMonthRange(dto);
		const exportMode = dto.exportMode ?? 'usd';
		this.reportingRates = null;
		this.reportingCurrency = 'USD';
		if (exportMode !== 'statement') {
			await this.prepareReportingCurrency(dto);
		}

		const tenantNamesMap = await this.getTenantNames([tenantId]);
		const tenantName = tenantNamesMap.get(tenantId) || 'unnamed_workspace';
		const fileName = this.buildFileName(tenantName, dto);
		if (this.deps.updateFileName) {
			await this.deps.updateFileName(fileName).catch(() => undefined);
		}
		const tempDir = path.join(os.tmpdir(), `export-split-${uuidv4()}`);
		const zipPath = path.join(os.tmpdir(), `${uuidv4()}-${fileName}`);
		const key = `exports/analytics/${tenantId}/${uuidv4()}-${fileName}`;
		const format = dto.format ?? 'csv';
		const groups = new Map<string, GroupState>();
		const openCsvWriters = new Map<string, GroupState>();
		const cache = this.createMetadataCache();
		cache.tenantNames.set(tenantId, tenantName);

		try {
			await fs.promises.mkdir(tempDir, { recursive: true });

			// Step 1: Pre-fetch metadata vào cache job-local
			await this.deps.onProgress?.(
				{
					progressCurrent: 1,
					progressTotal: 5,
					progressLabel: 'Preparing data stream',
				},
				true,
			);
			await this.throwIfCancelled();

			// Step 2: Stream 1-pass → enrich → ghi trực tiếp vào file group
			await this.deps.onProgress?.(
				{ progressCurrent: 2, progressLabel: 'Querying ClickHouse' },
				true,
			);
			const stringPool = new Map<string, string>();
			let totalRows = 0;
			let sinceYield = 0;
			let lastProgressAt = Date.now();
			let receivedFirstRows = false;
			const emitStreamingProgress = async () => {
				if (
					Date.now() - lastProgressAt <
					ExportRunner.PROGRESS_INTERVAL_MS
				)
					return;
				lastProgressAt = Date.now();
				await this.deps.onProgress?.(
					{
						progressCurrent: 2,
						progressLabel: `Streaming data (${totalRows} rows)`,
						processedRows: totalRows,
					},
					false,
				);
			};

			await this.streamRawDetails(
				tenantId,
				dto,
				exportMode,
				async (rawRows) => {
					if (!receivedFirstRows) {
						receivedFirstRows = true;
						await this.deps.onProgress?.(
							{
								progressCurrent: 2,
								progressLabel: 'Streaming data',
							},
							true,
						);
					}
					for (
						let start = 0;
						start < rawRows.length;
						start += ExportRunner.METADATA_WINDOW_SIZE
					) {
						const window = rawRows.slice(
							start,
							start + ExportRunner.METADATA_WINDOW_SIZE,
						);
						await this.hydrateMetadataWindow(window, cache);

						for (const raw of window) {
							const detail = this.enrichSingleRow(
								raw,
								stringPool,
								cache,
							);
							const groupKeys = this.getRowGroupKeys(
								detail,
								exportMode,
							);

							for (const gk of groupKeys) {
								let group = groups.get(gk);
								if (!group) {
									const groupFolder = path.join(tempDir, gk);
									await fs.promises.mkdir(groupFolder, {
										recursive: true,
									});
									group = {
										summary: createEmptyAccumulator(),
										detailFilePath: path.join(
											groupFolder,
											`detail.${format}`,
										),
										hasWrittenDetailFile: false,
									};
									groups.set(gk, group);
								}
								const writer = await this.acquireWriter(
									gk,
									group,
									format,
									openCsvWriters,
								);
								if (!writer.appendRow(detail as any)) {
									await writer.ready();
								}
								updateAccumulator(group.summary, detail as any);
							}
							totalRows++;
							sinceYield++;

							if (sinceYield >= 1000) {
								sinceYield = 0;
								await new Promise((resolve) =>
									setImmediate(resolve),
								);
								await emitStreamingProgress();
							}
						}
					}

					await this.throwIfCancelled();
					await emitStreamingProgress();
				},
			);
			stringPool.clear();

			// Step 3: Flush writers, ghi summary
			await this.deps.onProgress?.(
				{
					progressCurrent: 3,
					progressLabel: `Finalizing ${groups.size} folders`,
					processedRows: totalRows,
					totalRows,
				},
				true,
			);
			for (const [gk, group] of groups) {
				await this.throwIfCancelled();
				await group.writer?.flush();
				group.writer = undefined;
				const summary = this.buildSummaryFromAccumulator(
					group.summary,
					dto,
				);
				await this.writeSummaryFile(
					path.join(tempDir, gk, `summary.${format}`),
					summary,
					format,
					exportMode,
					this.reportingCurrency,
				);
			}

			// Step 4: ZIP + Upload
			await this.deps.onProgress?.(
				{ progressCurrent: 3, progressLabel: 'Creating ZIP archive' },
				true,
			);
			await this.throwIfCancelled();
			await zipFolder(tempDir, zipPath);

			await this.deps.onProgress?.(
				{
					progressCurrent: 4,
					progressLabel: 'Uploading ZIP file',
					processedRows: totalRows,
					totalRows,
				},
				true,
			);
			await this.throwIfCancelled();

			await this.deps.r2Upload({
				key,
				filePath: zipPath,
				contentType: 'application/zip',
				isPublic: false,
			});

			return {
				fileName,
				key,
				downloadUrl: await this.deps.r2SignedUrlDown({
					key,
					fileName,
					isPublic: false,
				}),
				expiresInSeconds: 4 * 3600,
				totalRows,
			};
		} finally {
			this.sanitizedNamesCache.clear();
			for (const [, g] of groups) {
				await g.writer?.flush().catch(() => {});
			}
			await fs.promises
				.rm(tempDir, { recursive: true, force: true })
				.catch(() => undefined);
			await fs.promises.unlink(zipPath).catch(() => undefined);
		}
	}

	// PLACEHOLDER_HELPERS

	/**
	 * CSV writers can be safely closed and reopened in append mode. Keeping only
	 * a bounded LRU set avoids exhausting file descriptors for wide exports.
	 * XLSX cannot append after commit, so its existing one-writer-per-group
	 * behaviour is intentionally retained.
	 */
	private async acquireWriter(
		groupKey: string,
		group: GroupState,
		format: 'csv' | 'xlsx',
		openCsvWriters: Map<string, GroupState>,
	): Promise<IStreamDetailWriter> {
		if (group.writer) {
			if (format === 'csv') {
				openCsvWriters.delete(groupKey);
				openCsvWriters.set(groupKey, group);
			}
			return group.writer;
		}

		if (format === 'csv') {
			while (openCsvWriters.size >= ExportRunner.MAX_OPEN_CSV_WRITERS) {
				const oldest = openCsvWriters.entries().next().value as
					| [string, GroupState]
					| undefined;
				if (!oldest) break;
				const [oldestKey, oldestGroup] = oldest;
				await oldestGroup.writer?.flush();
				oldestGroup.writer = undefined;
				openCsvWriters.delete(oldestKey);
			}
		}

		group.writer = createStreamWriter(
			group.detailFilePath,
			format,
			group.hasWrittenDetailFile,
		);
		group.hasWrittenDetailFile = true;
		if (format === 'csv') openCsvWriters.set(groupKey, group);
		return group.writer;
	}

	private getRowGroupKeys(
		row: DetailRow,
		exportMode: 'usd' | 'statement',
	): string[] {
		const tenantFolder = this.sanitizeFileName(
			row.tenant || 'unnamed_workspace',
		);
		if (exportMode === 'statement') {
			const currencyFolder = this.sanitizeFileName(row.currency || 'USD');
			return [path.join(tenantFolder, currencyFolder)];
		}
		return [tenantFolder];
	}

	private buildSummaryFromAccumulator(
		acc: SummaryAccumulator,
		dto: AnalyticsReportExportDto,
	): SummaryRow {
		return {
			startDate: acc.minStartDate || `${dto.fromDate}-01`,
			endDate: acc.maxEndDate || this.lastDayOfMonth(dto.endDate),
			tenantName: acc.tenantName || 'unnamed_workspace',
			totalUsage: acc.totalUsage,
			revenueUsd: formatRevenueSum(acc),
			currency: acc.currency || 'USD',
			trackCount: acc.uniqueIsrcs.size,
			releaseCount: acc.uniqueReleases.size,
			labelCount: acc.uniqueLabels.size,
			dspCount: acc.uniqueDsps.size,
			territoryCount: acc.uniqueTerritories.size,
			artistCount: acc.uniqueArtists.size,
		} as any;
	}

	private getSummaryColumns(
		exportMode: 'usd' | 'statement' = 'usd',
		currency: string = 'USD',
	): Partial<ExcelJS.Column>[] {
		const revenueHeader =
			exportMode === 'statement' || currency !== 'USD'
				? 'Revenue'
				: 'RevenueUsd';
		return [
			{ header: 'StartDate', key: 'startDate', width: 14 },
			{ header: 'EndDate', key: 'endDate', width: 14 },
			{ header: 'WorkspaceName', key: 'tenantName', width: 28 },
			{ header: 'TotalUsage', key: 'totalUsage', width: 14 },
			{
				header: revenueHeader,
				key: 'revenueUsd',
				width: 18,
			},
			{ header: 'Currency', key: 'currency', width: 10 },
			{ header: 'TrackCount', key: 'trackCount', width: 12 },
			{ header: 'ReleaseCount', key: 'releaseCount', width: 14 },
			{ header: 'LabelCount', key: 'labelCount', width: 12 },
			{ header: 'DspCount', key: 'dspCount', width: 12 },
			{ header: 'TerritoryCount', key: 'territoryCount', width: 15 },
			{ header: 'ArtistCount', key: 'artistCount', width: 12 },
		];
	}

	private async writeSummaryFile(
		filePath: string,
		summary: SummaryRow,
		format: 'xlsx' | 'csv',
		exportMode: 'usd' | 'statement',
		currency: string,
	): Promise<void> {
		if (format === 'csv') {
			const columns = this.getSummaryColumns(exportMode, currency);
			const headers = columns.map((c) => c.header?.toString() ?? '');
			const keys = columns.map((c) => c.key?.toString() ?? '');
			const lines = [
				`﻿${headers.map((h) => this.csvEscape(h)).join(',')}`,
				keys
					.map((key) => this.csvEscape((summary as any)[key]))
					.join(','),
			];
			await fs.promises.writeFile(filePath, lines.join('\n'), 'utf8');
		} else {
			const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
				filename: filePath,
				useStyles: true,
				useSharedStrings: false,
			});
			const sheet = workbook.addWorksheet('Summary');
			sheet.columns = this.getSummaryColumns(exportMode, currency);
			sheet.addRow(summary).commit();
			sheet.commit();
			await workbook.commit();
		}
	}

	// PLACEHOLDER_METADATA

	private createMetadataCache(): MetadataCache {
		return {
			trackMeta: new LRUCache<string, MetadataRow | MissingCacheValue>({
				max: ExportRunner.TRACK_METADATA_CACHE_SIZE,
			}),
			releaseMeta: new LRUCache<string, MetadataRow | MissingCacheValue>({
				max: ExportRunner.RELEASE_METADATA_CACHE_SIZE,
			}),
			tenantNames: new LRUCache<string, string | MissingCacheValue>({
				max: ExportRunner.TENANT_NAME_CACHE_SIZE,
			}),
		};
	}

	/**
	 * Fetch only metadata referenced by this stream window. Missing values are cached too,
	 * preventing repeated Postgres lookups for identifiers that have no metadata.
	 */
	private async hydrateMetadataWindow(
		rawRows: RawDetailRow[],
		cache: MetadataCache,
	): Promise<void> {
		const missingIsrcs = Array.from(
			new Set(
				rawRows
					.map((row) => row.isrc)
					.filter((isrc) => isrc && !cache.trackMeta.has(isrc)),
			),
		);
		await this.hydrateTrackMetadata(missingIsrcs, cache);

		const upcs = new Set<string>();
		for (const raw of rawRows) {
			const releaseUpc = raw.isrc
				? this.unwrapMetadata(cache.trackMeta.get(raw.isrc))
						?.release_upc
				: undefined;
			if (releaseUpc) upcs.add(releaseUpc);
		}
		await this.hydrateReleaseMetadata(
			Array.from(upcs).filter((upc) => !cache.releaseMeta.has(upc)),
			cache,
		);

		const missingTenantIds = Array.from(
			new Set(
				rawRows
					.map((row) => row.tenant_id)
					.filter(
						(tenantId) =>
							tenantId && !cache.tenantNames.has(tenantId),
					),
			),
		);
		await this.hydrateTenantNames(missingTenantIds, cache);
	}

	private async hydrateTrackMetadata(
		isrcs: string[],
		cache: MetadataCache,
	): Promise<void> {
		for (
			let start = 0;
			start < isrcs.length;
			start += ExportRunner.METADATA_QUERY_BATCH_SIZE
		) {
			const batch = isrcs.slice(
				start,
				start + ExportRunner.METADATA_QUERY_BATCH_SIZE,
			);
			const metadata = await this.getTrackMetadata(batch);
			for (const isrc of batch) {
				cache.trackMeta.set(
					isrc,
					metadata.get(isrc) ?? MISSING_CACHE_VALUE,
				);
			}
		}
	}

	private async hydrateReleaseMetadata(
		upcs: string[],
		cache: MetadataCache,
	): Promise<void> {
		for (
			let start = 0;
			start < upcs.length;
			start += ExportRunner.METADATA_QUERY_BATCH_SIZE
		) {
			const batch = upcs.slice(
				start,
				start + ExportRunner.METADATA_QUERY_BATCH_SIZE,
			);
			const metadata = await this.getReleaseMetadataByUpc(batch);
			for (const upc of batch) {
				cache.releaseMeta.set(
					upc,
					metadata.get(upc) ?? MISSING_CACHE_VALUE,
				);
			}
		}
	}

	private async hydrateTenantNames(
		tenantIds: string[],
		cache: MetadataCache,
	): Promise<void> {
		for (
			let start = 0;
			start < tenantIds.length;
			start += ExportRunner.METADATA_QUERY_BATCH_SIZE
		) {
			const batch = tenantIds.slice(
				start,
				start + ExportRunner.METADATA_QUERY_BATCH_SIZE,
			);
			const names = await this.getTenantNames(batch);
			for (const tenantId of batch) {
				cache.tenantNames.set(
					tenantId,
					names.get(tenantId) ?? MISSING_CACHE_VALUE,
				);
			}
		}
	}

	private unwrapMetadata(
		value: MetadataRow | MissingCacheValue | undefined,
	): MetadataRow | undefined {
		return value && !('missing' in value) ? value : undefined;
	}

	private enrichSingleRow(
		raw: RawDetailRow,
		stringPool: Map<string, string>,
		cache: MetadataCache,
	): DetailRow {
		const pool = (val: string | null | undefined): string | undefined => {
			if (!val) return undefined;
			let cached = stringPool.get(val);
			if (!cached) {
				cached = val;
				stringPool.set(val, cached);
			}
			return cached;
		};

		const isrc = raw.isrc;
		const trackInfo = isrc
			? this.unwrapMetadata(cache.trackMeta.get(isrc))
			: undefined;
		const isStandardUpc = isValidStandardUpc(raw.fallback_upc || '');
		const upcToLookup = isStandardUpc
			? raw.fallback_upc
			: trackInfo?.release_upc;
		const releaseInfo = upcToLookup
			? this.unwrapMetadata(cache.releaseMeta.get(upcToLookup))
			: undefined;

		const baseInfo = trackInfo || releaseInfo;
		const cachedTenantName = raw.tenant_id
			? cache.tenantNames.get(raw.tenant_id)
			: undefined;
		const finalTenantName =
			typeof cachedTenantName === 'string'
				? cachedTenantName
				: baseInfo?.workspace_name;

		const artistNameRaw = pool(
			raw.fallback_artist_name ||
				trackInfo?.artist_names ||
				releaseInfo?.artist_names ||
				'',
		);

		return {
			date: pool(raw.date),
			startDate: pool(raw.start_date),
			endDate: pool(raw.end_date),
			tenant: pool(finalTenantName),
			dspName: pool(raw.dsp_name),
			upc: pool(raw.fallback_upc),
			isrc: pool(raw.isrc),
			releaseName: pool(
				raw.fallback_album_title || baseInfo?.release_title || '',
			),
			trackName: pool(
				raw.fallback_track_title || trackInfo?.track_title || '',
			),
			artistName: artistNameRaw,
			labelName: pool(
				raw.fallback_label_name || baseInfo?.label_name || '',
			),
			territory: pool(raw.territory),
			totalUsage: Number(raw.total_usage || 0),
			revenueUsd: this.reportingAmount(raw),
			currency: pool(
				this.reportingRates
					? this.reportingCurrency
					: raw.currency || 'USD',
			),
		} as any;
	}

	/**
	 * Detail rows are already summed USD for one month. Multiply that total by
	 * the month rate instead of joining exchange_rates inside the export query.
	 */
	private reportingAmount(raw: RawDetailRow): string {
		const amount = String(raw.revenue_amount || raw.revenue_usd || '0');
		if (!this.reportingRates) return amount;
		const month = String(raw.date ?? '').slice(0, 7);
		const rate = this.reportingRates.get(month);
		if (!rate) {
			throw new MissingExchangeRateError(this.reportingCurrency, [
				month || '(blank)',
			]);
		}
		return multiplyDecimal(amount, rate);
	}

	private sanitizeFileName(name: string): string {
		const cached = this.sanitizedNamesCache.get(name);
		if (cached !== undefined) return cached;

		const sanitized =
			name
				.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
				.replace(/\s+/g, '_')
				.replace(/_+/g, '_')
				.replace(/^_|_$/g, '')
				.substring(0, 100) || 'unnamed';

		this.sanitizedNamesCache.set(name, sanitized);
		return sanitized;
	}

	// PLACEHOLDER_QUERY

	private async prepareReportingCurrency(
		dto: AnalyticsReportExportDto,
	): Promise<void> {
		const currency = (dto.currency ?? 'USD').trim().toUpperCase();
		if (!REPORTING_CURRENCIES.includes(currency as ReportingCurrency)) {
			throw new Error(`Unsupported reporting currency: ${currency}`);
		}
		dto.currency = currency as ReportingCurrency;
		this.reportingCurrency = dto.currency;
		if (dto.currency === 'USD') return;

		const rates = await this.loadReportingRates(
			dto.currency,
			dto.fromDate,
			dto.endDate,
		);
		const cubeMonths = await this.listExportCubeMonths(
			dto.fromDate,
			dto.endDate,
		);
		const missing = cubeMonths
			.filter((month) => !this.isPositiveDecimal(rates.get(month)))
			.sort();
		if (missing.length > 0) {
			throw new MissingExchangeRateError(dto.currency, missing);
		}
		this.reportingRates = rates;
	}

	private isPositiveDecimal(value: string | undefined): boolean {
		return (
			!!value &&
			/^\+?(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/.test(value.trim())
		);
	}

	private async loadReportingRates(
		currency: string,
		fromMonth: string,
		toMonth: string,
	): Promise<Map<string, string>> {
		const rows = await this.deps.chQuery<{
			rate_month: string;
			usd_to_local_rate: string;
		}>(
			`SELECT
         rate_month,
         toString(argMax(usd_to_local_rate, updated_at)) AS usd_to_local_rate
       FROM ${CLICKHOUSE_TABLES.EXCHANGE_RATES}
       WHERE currency = {currency:String}
         AND rate_month >= {fromMonth:String}
         AND rate_month <= {toMonth:String}
       GROUP BY rate_month`,
			{ currency, fromMonth, toMonth },
		);
		const rates = new Map<string, string>();
		for (const row of rows) {
			rates.set(row.rate_month, String(row.usd_to_local_rate));
		}
		return rates;
	}

	private async listExportCubeMonths(
		fromMonth: string,
		toMonth: string,
	): Promise<string[]> {
		const fromPartition = fromMonth.replace('-', '');
		const toPartition = toMonth.replace('-', '');
		try {
			const rows = await this.deps.chQuery<{ partition: string }>(
				`SELECT DISTINCT partition
         FROM system.parts
         WHERE database = {database:String}
           AND table = {table:String}
           AND active = 1
           AND partition >= {fromPartition:String}
           AND partition <= {toPartition:String}`,
				{
					database: 'music_analytics',
					table: CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY,
					fromPartition,
					toPartition,
				},
			);
			return this.normalizeCubeMonths(
				rows.map((row) => String(row.partition)),
				fromMonth,
				toMonth,
			);
		} catch (error) {
			if (!this.isPartsAccessError(error)) throw error;
			const rows = await this.deps.chQuery<{ rate_month: string }>(
				`SELECT DISTINCT formatDateTime(period, '%Y-%m') AS rate_month
         FROM ${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY}
         WHERE period >= toDate({from:String})
           AND period <= toDate({to:String})`,
				{ from: `${fromMonth}-01`, to: `${toMonth}-01` },
			);
			return this.normalizeCubeMonths(
				rows.map((row) => row.rate_month),
				fromMonth,
				toMonth,
			);
		}
	}

	private isPartsAccessError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		return /privilege|ACCESS_DENIED|not enough/i.test(message);
	}

	private normalizeCubeMonths(
		values: string[],
		fromMonth: string,
		toMonth: string,
	): string[] {
		const months = new Set<string>();
		for (const value of values) {
			const digits = value.replace(/\D/g, '');
			if (digits.length < 6) continue;
			const month = `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
			if (month >= fromMonth && month <= toMonth) months.add(month);
		}
		return [...months];
	}

	private buildFileName(
		tenantName: string,
		dto: AnalyticsReportExportDto,
	): string {
		const sanitized = this.sanitizeFileName(tenantName);
		const pad = (n: number) => String(n).padStart(2, '0');
		const now = new Date();
		const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
		const currency = (dto.currency ?? 'USD').toUpperCase();
		const suffix =
			dto.exportMode === 'statement'
				? 'statement-report'
				: currency === 'USD'
					? 'analytics-report'
					: `analytics-report_${currency}`;
		return `${sanitized}_${suffix}_${dto.fromDate}_${dto.endDate}_${timestamp}.zip`;
	}

	private getMonthRange(dto: AnalyticsReportExportDto) {
		if (dto.fromDate > dto.endDate) {
			throw new Error('fromDate must be before or equal to endDate');
		}
		return {
			from: `${dto.fromDate}-01`,
			to: `${dto.endDate}-01`,
			startDate: `${dto.fromDate}-01`,
			endDate: this.lastDayOfMonth(dto.endDate),
		};
	}

	private buildFilters(tenantId: string, dto: AnalyticsReportExportDto) {
		const params: Record<string, unknown> = {
			from: `${dto.fromDate}-01`,
			to: `${dto.endDate}-01`,
		};
		const filters: string[] = [
			's.period >= toDate({from:String})',
			's.period <= toDate({to:String})',
			getOwnershipLedgerFallbackPredicate(),
		];

		// tenant: tenantIds (batch) ưu tiên hơn tenantId (single) > current tenant > system all
		let resolvedTenantIds: string[] = [];
		if (dto.tenantIds?.length) {
			resolvedTenantIds = dto.tenantIds;
		} else if (dto.tenantId) {
			resolvedTenantIds = [dto.tenantId];
		} else if (!checkIsSystemTenant(tenantId)) {
			resolvedTenantIds = [tenantId];
		}

		if (resolvedTenantIds.length > 0) {
			filters.push("(t.isrc = '' OR t.is_deleted = 0)");
			filters.push(
				"coalesce(nullIf(o.tenant_id, ''), nullIf(t.tenant_id, ''), nullIf(s.ingest_tenant_id, '')) IN ({tenantIds:Array(String)})",
			);
			params.tenantIds = resolvedTenantIds;
		}

		if (dto.labelId) {
			filters.push("(t.isrc = '' OR t.is_deleted = 0)");
			filters.push(
				"coalesce(nullIf(o.label_id, ''), nullIf(t.label_id, ''), nullIf(s.ingest_label_id, '')) = {labelId:String}",
			);
			params.labelId = dto.labelId;
		}

		if (dto.releaseId) {
			filters.push('t.is_deleted = 0');
			filters.push('t.release_id = {releaseId:String}');
			params.releaseId = dto.releaseId;
		}

		if (dto.artistId) {
			filters.push('t.is_deleted = 0');
			filters.push('has(t.artist_ids, {artistId:String})');
			params.artistId = dto.artistId;
		}

		if (dto.releaseType) {
			filters.push('t.is_deleted = 0');
			filters.push('t.release_type = {releaseType:String}');
			params.releaseType = dto.releaseType;
		}

		if (dto.channelId) {
			filters.push('t.is_deleted = 0');
			filters.push('t.channel_id = {channelId:String}');
			params.channelId = dto.channelId;
		}

		if (dto.isrc) {
			filters.push('s.isrc = {isrc:String}');
			params.isrc = dto.isrc;
		}

		if (dto.importSource) {
			filters.push('s.import_source = {importSource:String}');
			params.importSource = dto.importSource;
		}

		const scopedFilter = appendAnalyticsVideoScopeFilter(
			'',
			params,
			getAnalyticsVideoScope(dto),
			't',
			dto.channelId,
		);
		if (scopedFilter) {
			filters.push('t.is_deleted = 0');
			filters.push(scopedFilter.trim().replace(/^AND\s+/i, ''));
		}

		// DSP: pgDspId ưu tiên nhất > dspReportId > dspId generic
		if (dto.pgDspId) {
			filters.push(
				`s.dsp_id IN (SELECT id_dsps_report FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE pg_uuid = {pgDspId:String})`,
			);
			params.pgDspId = dto.pgDspId;
		} else if (dto.dspReportId) {
			filters.push('s.dsp_id = {dspReportId:String}');
			params.dspReportId = dto.dspReportId;
		} else if (dto.dspId) {
			filters.push(`(
        s.dsp_id = {dspId:String}
        OR r.pg_uuid = {dspId:String}
        OR p.pg_uuid = {dspId:String}
        OR p.dsp_code = {dspId:String}
      )`);
			params.dspId = dto.dspId;
		}

		return {
			params,
			whereSql: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
		};
	}

	private getCommonJoins() {
		return `
      LEFT JOIN ${getDedupedOwnershipSubquerySql('revenue')} o
        ON s.isrc = o.isrc
        AND s.period >= o.revenue_effective_from
        AND (o.revenue_effective_to IS NULL OR s.period < o.revenue_effective_to)
      LEFT JOIN (
        SELECT isrc, tenant_id, label_id, release_id, artist_ids, release_type, is_deleted, channel_id
        FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL
	  ) t ON s.isrc = t.isrc AND s.isrc NOT IN ('', 'N/A', 'NA')
      LEFT JOIN (
        SELECT id_dsps_report, pg_uuid, dsp_name
        FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL
      ) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (
        SELECT pg_uuid, dsp_code, dsp_name
        FROM music_analytics.${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL
      ) p ON r.pg_uuid = p.pg_uuid
    `;
	}

	private async streamRawDetails(
		tenantId: string,
		dto: AnalyticsReportExportDto,
		exportMode: 'usd' | 'statement',
		onRows: (rows: RawDetailRow[]) => Promise<void>,
	): Promise<number> {
		const { params, whereSql } = this.buildFilters(tenantId, dto);
		const resolvedDspName =
			"coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)";

		const query =
			exportMode === 'statement'
				? getRawStatementDetailsPageQuery(
						resolvedDspName,
						this.getCommonJoins(),
						whereSql,
					)
				: getRawDetailsPageQuery(
						resolvedDspName,
						this.getCommonJoins(),
						whereSql,
					);

		return this.deps.chQueryStream<RawDetailRow>(query, params, onRows);
	}

	private async getTrackMetadata(
		isrcs: string[],
	): Promise<Map<string, MetadataRow>> {
		const map = new Map<string, MetadataRow>();
		if (!isrcs.length) return map;
		const rows = await this.deps.pgQuery(getTrackMetadataQuery(), [isrcs]);
		for (const row of rows) map.set(row.isrc, row);
		return map;
	}

	private async getTenantNames(
		tenantIds: string[],
	): Promise<Map<string, string>> {
		const map = new Map<string, string>();
		if (!tenantIds.length) return map;

		const validUuidTenantIds = tenantIds.filter((id) => {
			const isUuid =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					id,
				);
			if (!isUuid && id === 'system-tenant') {
				map.set(id, 'System Tenant');
			}
			return isUuid;
		});

		if (!validUuidTenantIds.length) return map;

		const rows = await this.deps.pgQuery(getTenantNamesQuery(), [
			validUuidTenantIds,
		]);
		for (const row of rows) map.set(row.id, row.tenant_name);
		return map;
	}

	private async getReleaseMetadataByUpc(
		upcs: string[],
	): Promise<Map<string, MetadataRow>> {
		const map = new Map<string, MetadataRow>();
		if (!upcs.length) return map;
		const rows = await this.deps.pgQuery(getReleaseMetadataByUpcQuery(), [
			upcs,
		]);
		for (const row of rows) map.set(row.upc, row);
		return map;
	}

	private csvEscape(value: unknown): string {
		const text = value == null ? '' : String(value);
		if (/[",\n\r]/.test(text)) {
			return `"${text.replace(/"/g, '""')}"`;
		}
		return text;
	}

	private lastDayOfMonth(month: string): string {
		const [year, monthNumber] = month
			.split('-')
			.map((part) => Number(part));
		const lastDay = new Date(year, monthNumber, 0).getDate();
		return `${month}-${String(lastDay).padStart(2, '0')}`;
	}
}
