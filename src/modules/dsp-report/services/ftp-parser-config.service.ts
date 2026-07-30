import {
	BadRequestException,
	Injectable,
	Logger,
	OnApplicationBootstrap,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ClickHouseMigrationService } from '../../clickhouse/clickhouse-migration.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import {
	DspMappingService,
	DspsReport,
} from '../../dsp/services/dsp-mapping.service';
import {
	BaseParser,
	PARSER_REGISTRY,
	ParserCatalogFieldMapping,
} from '../../etl/parsers';
import {
	ConfiguredDspFieldMappingParser,
	ConfiguredSalesFieldMappingParser,
} from '../../etl/parsers/configured-field-mapping.parser';
import {
	DeezerIllegitimateParser,
	SoundCloudIllegitimateParser,
	SpotifyIllegitimateParser,
	TiktokIllegitimateParser,
} from '../../etl/parsers/illegitimate';
import {
	BaseSalesParser,
	SALES_PARSER_REGISTRY,
} from '../../etl/parsers/sales';
import {
	FtpSourceCategory,
	UpsertFtpParserConfigDto,
} from '../dto/ftp-parser-config.dto';

export type FtpParser =
	| BaseParser
	| BaseSalesParser
	| {
			parseFile(filePath: string, batchId: string): Promise<unknown[]>;
	  };

export interface ParserCatalogItem {
	code: string;
	category: FtpSourceCategory;
	label: string;
}

export interface FtpParserConfigRecord {
	dspReportId: string;
	sourceCategory: FtpSourceCategory;
	parserCode: string;
	includePatterns: string[];
	excludePatterns: string[];
	isActive: boolean;
	description: string;
	configVersion: number;
	createdAt: string;
	updatedAt: string;
}

export interface FtpParserConfigDetails extends FtpParserConfigRecord {
	parser: ParserCatalogRecord | null;
}

export interface FtpParserFieldMapping {
	reportColumn: string;
	/** Internal legacy-header alias; it is resolved by the service, never required from UI. */
	parserColumn?: string;
	targetColumn: string;
	transform?: string;
}

export interface ParserCatalogRecord {
	parserCode: string;
	sourceCategory: FtpSourceCategory;
	parserName: string;
	sourceFile: string;
	targetTable: string;
	fieldMappings: FtpParserFieldMapping[];
	parserSource: string;
	sourceHash: string;
	isSelectable: boolean;
	syncedAt: string;
}

export interface ResolvedFtpParserConfig {
	dspReport: DspsReport;
	category: FtpSourceCategory;
	parserCode: string;
	parser: FtpParser | null;
	configVersion: number;
	usesDatabaseConfig: boolean;
	usesDatabaseFieldMappings: boolean;
	selectFile(relativePath: string): boolean;
}

type CatalogEntry = ParserCatalogItem & { factory: () => FtpParser };

const SUPPORTED_FIELD_TRANSFORMS = [
	'trim',
	'raw',
	'uppercase',
	'lowercase',
	'isrc',
] as const;

function isSupportedFieldTransform(value: string): boolean {
	return (SUPPORTED_FIELD_TRANSFORMS as readonly string[]).includes(value);
}

function normalizeFieldTransform(value?: string): string {
	return value && isSupportedFieldTransform(value) ? value : 'trim';
}

function toRecord(row: any): FtpParserConfigRecord {
	return {
		dspReportId: row.dsp_report_id,
		sourceCategory: row.source_category,
		parserCode: row.parser_code,
		includePatterns: row.include_patterns || [],
		excludePatterns: row.exclude_patterns || [],
		isActive: Number(row.is_active) === 1,
		description: row.description || '',
		configVersion: Number(row.config_version || 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toParserCatalogRecord(
	row: any,
	fieldMappings: FtpParserFieldMapping[] = [],
): ParserCatalogRecord {
	return {
		parserCode: row.parser_code,
		sourceCategory: row.source_category,
		parserName: row.parser_name,
		sourceFile: row.source_file,
		targetTable: row.target_table,
		fieldMappings,
		parserSource: row.parser_source,
		sourceHash: row.source_hash,
		isSelectable: Number(row.is_selectable) === 1,
		syncedAt: row.synced_at,
	};
}

@Injectable()
export class FtpParserConfigService implements OnApplicationBootstrap {
	private readonly logger = new Logger(FtpParserConfigService.name);
	private readonly catalog = this.buildCatalog();

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly dspMappingService: DspMappingService,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
	) {}

	async onApplicationBootstrap(): Promise<void> {
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.debug(
				'Skipping automatic parser catalog sync (not worker role)',
			);
			return;
		}

		try {
			this.logger.log(
				'Worker bootstrap: seeding FTP parser configs and syncing parser catalog',
			);
			await this.clickHouseMigrationService.waitForMigrations();
			const seedResult = await this.seedLegacyConfigs();
			const syncResult = await this.syncParserCatalog();
			this.logger.log(
				`Worker bootstrap parser catalog sync completed: ${syncResult.parsersSynced} definitions from ${syncResult.filesScanned} files; ${seedResult.configsCreated} legacy configs created`,
			);
		} catch (err) {
			const error = err as Error;
			this.logger.error(
				`Automatic FTP parser configuration sync failed: ${error.message}`,
				error.stack,
			);
		}
	}

	/**
	 * Seed existing FTP folder mappings without changing their import-history version.
	 * Existing database configurations are deliberately preserved.
	 */
	async seedLegacyConfigs(): Promise<{
		reportsScanned: number;
		configsCreated: number;
	}> {
		await this.clickHouseMigrationService.waitForMigrations();
		const reports = await this.clickHouseService.query<DspsReport>(
			`SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE source = 'ftp_folder'`,
		);
		if (reports.length === 0)
			return { reportsScanned: 0, configsCreated: 0 };
		const existing = await this.clickHouseService.query<{
			dsp_report_id: string;
			source_category: string;
		}>(
			`SELECT dsp_report_id, source_category FROM ${CLICKHOUSE_TABLES.FTP_DSP_PARSER_CONFIGS} FINAL`,
		);
		const existingKeys = new Set(
			existing.map(
				(row) => `${row.dsp_report_id}|${row.source_category}`,
			),
		);
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const rows: Record<string, unknown>[] = [];
		for (const report of reports) {
			for (const category of Object.values(FtpSourceCategory)) {
				if (existingKeys.has(`${report.id_dsps_report}|${category}`))
					continue;
				const legacy = this.getLegacyEntry(report.dsp_name, category);
				if (!legacy) continue;
				rows.push({
					dsp_report_id: report.id_dsps_report,
					source_category: category,
					parser_code: legacy.code,
					include_patterns: [],
					exclude_patterns: [],
					is_active: 1,
					description: 'Seeded from legacy folder parser mapping',
					config_version: 0,
					created_at: now,
					updated_at: now,
				});
			}
		}
		if (rows.length > 0) {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_DSP_PARSER_CONFIGS,
				rows,
			);
			this.logger.log(
				`Seeded ${rows.length} legacy FTP parser configurations`,
			);
		}
		return { reportsScanned: reports.length, configsCreated: rows.length };
	}

	getRuntimeCatalog(): ParserCatalogItem[] {
		return Array.from(this.catalog.values())
			.map(({ factory: _factory, ...item }) => item)
			.sort((a, b) => a.code.localeCompare(b.code));
	}

	/**
	 * Returns the catalog stored from the parser source files. Run syncParserCatalog
	 * after a deployment when parser implementations have changed.
	 */
	async getCatalog(): Promise<ParserCatalogRecord[]> {
		await this.clickHouseMigrationService.waitForMigrations();
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_PARSER_CATALOG} FINAL WHERE is_active = 1 ORDER BY source_category, parser_code`,
		);
		const mappings = await this.findEffectiveCatalogFieldMappings();
		return rows.map((row) =>
			toParserCatalogRecord(
				row,
				mappings.get(`${row.parser_code}|${row.source_category}`) || [],
			),
		);
	}

	async getCatalogByParserCode(
		parserCode: string,
	): Promise<ParserCatalogRecord | null> {
		await this.clickHouseMigrationService.waitForMigrations();
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_PARSER_CATALOG} FINAL WHERE parser_code = {parserCode:String} AND is_active = 1 ORDER BY synced_at DESC LIMIT 1`,
			{ parserCode },
		);
		if (rows.length === 0) return null;
		const row = rows[0];
		const mappings = await this.findEffectiveCatalogFieldMappings(
			parserCode,
			row.source_category,
		);
		return toParserCatalogRecord(
			row,
			mappings.get(`${parserCode}|${row.source_category}`) || [],
		);
	}

	/**
	 * Reads every concrete parser source file (TypeScript in development, compiled
	 * JavaScript in production) and persists its implementation and
	 * the report-column -> fact-column mappings found in its row assignments.
	 */
	async syncParserCatalog(force = false): Promise<{
		filesScanned: number;
		parsersSynced: number;
	}> {
		await this.clickHouseMigrationService.waitForMigrations();
		const root = this.getParserSourceRoot();
		if (!root) {
			throw new BadRequestException(
				'Parser source directory was not found in this deployment',
			);
		}

		const files = this.findParserFiles(root);
		const knownCodes = new Map<string, CatalogEntry[]>();
		for (const entry of this.catalog.values()) {
			const parserName = entry.factory().constructor.name;
			const entries = knownCodes.get(parserName) || [];
			entries.push(entry);
			knownCodes.set(parserName, entries);
		}

		const existing = await this.clickHouseService.query<{
			parser_code: string;
			source_category: string;
			parser_name: string;
			source_file: string;
			target_table: string;
			parser_source: string;
			source_hash: string;
			is_selectable: number;
		}>(
			`SELECT parser_code, source_category, parser_name, source_file, target_table, parser_source, source_hash, is_selectable
			 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_CATALOG} FINAL
			 WHERE is_active = 1`,
		);
		const existingHashes = new Map(
			existing.map((row) => [
				`${row.parser_code}|${row.source_category}`,
				row.source_hash,
			]),
		);
		const existingCatalogMappings = await this.findCatalogFieldMappings();
		const existingCatalogMappingRows = await this.clickHouseService.query<{
			parser_code: string;
			source_category: string;
			mapping_key: string;
			report_column: string;
			parser_column: string;
			target_column: string;
			transform: string;
		}>(
			`SELECT parser_code, source_category, mapping_key, report_column, parser_column, target_column, transform
			 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS} FINAL
			 WHERE mapping_scope = 'catalog' AND is_active = 1`,
		);
		const existingCatalogMappingsByKey = new Map<
			string,
			typeof existingCatalogMappingRows
		>();
		for (const row of existingCatalogMappingRows) {
			const key = `${row.parser_code}|${row.source_category}`;
			const items = existingCatalogMappingsByKey.get(key) || [];
			items.push(row);
			existingCatalogMappingsByKey.set(key, items);
		}
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const rows: Record<string, unknown>[] = [];
		const mappingRows: Record<string, unknown>[] = [];
		for (const filePath of files) {
			const source = fs.readFileSync(filePath, 'utf8');
			const parserDefinitions = this.extractParserDefinitions(source);
			const sourceFile = path
				.relative(root, filePath)
				.replace(/\\/g, '/');
			const sourceHash = crypto
				.createHash('sha256')
				.update(source)
				.digest('hex');

			for (const parserDefinition of parserDefinitions) {
				const { parserName, parserSource } = parserDefinition;
				const entries = knownCodes.get(parserName) || [];
				const catalogEntries = entries.length
					? entries
					: [
							this.createSourceOnlyCatalogEntry(
								parserName,
								sourceFile,
							),
						];
				for (const entry of catalogEntries) {
					const catalogKey = `${entry.code}|${entry.category}`;
					const explicitFieldMappings = this.getExplicitCatalogFieldMappings(
						entry,
					);
					const fieldMappings =
						explicitFieldMappings ||
						this.extractFieldMappings(parserSource);
					const staleCategoryRows = entries.length
						? []
						: existing.filter(
								(row) =>
									row.parser_code === entry.code &&
									row.source_file === sourceFile &&
									row.source_category !== entry.category,
							);
					for (const stale of staleCategoryRows) {
						rows.push({
							parser_code: stale.parser_code,
							source_category: stale.source_category,
							parser_name: stale.parser_name,
							source_file: stale.source_file,
							target_table: stale.target_table,
							parser_source: stale.parser_source,
							source_hash: stale.source_hash,
							is_selectable: stale.is_selectable,
							is_active: 0,
							synced_at: now,
						});
						mappingRows.push(
							...(existingCatalogMappingsByKey.get(
								`${stale.parser_code}|${stale.source_category}`,
							) || []).map((mapping) => ({
								mapping_scope: 'catalog',
								dsp_report_id: '',
								parser_code: mapping.parser_code,
								source_category: mapping.source_category,
								config_version: 0,
								mapping_key: mapping.mapping_key,
								report_column: mapping.report_column,
								parser_column: mapping.parser_column,
								target_column: mapping.target_column,
								transform: mapping.transform,
								is_active: 0,
								updated_at: now,
							})),
						);
					}
					const existingMappings =
						existingCatalogMappingsByKey.get(catalogKey) || [];
					const mappingsAreSafe =
						existingMappings.length > 0 &&
						existingMappings.every((mapping) =>
							isSupportedFieldTransform(mapping.transform),
						);
					if (
						!force &&
						existingHashes.get(catalogKey) === sourceHash &&
						(fieldMappings.length === 0 ||
							(existingCatalogMappings.has(catalogKey) &&
								mappingsAreSafe))
					)
						continue;
					rows.push({
						parser_code: entry.code,
						source_category: entry.category,
						parser_name: parserName,
						source_file: sourceFile,
						target_table: this.getTargetTable(entry.category),
						parser_source: source,
						source_hash: sourceHash,
						is_selectable: entries.length ? 1 : 0,
						is_active: 1,
						synced_at: now,
					});
					mappingRows.push(
						...fieldMappings.map((mapping) => ({
							mapping_scope: 'catalog',
							dsp_report_id: '',
							parser_code: entry.code,
							source_category: entry.category,
							config_version: 0,
							mapping_key: this.makeMappingKey(mapping),
							report_column: mapping.reportColumn,
							parser_column:
								mapping.parserColumn || mapping.reportColumn,
							target_column: mapping.targetColumn,
							transform: mapping.transform || 'trim',
							is_active: 1,
							updated_at: now,
						})),
					);
					if (explicitFieldMappings) {
						this.logger.log(
							`Parser catalog mapping sync ${entry.code} (${entry.category}): ${fieldMappings.length} multi-file mappings: ${fieldMappings
								.map(
									(mapping) =>
										`${mapping.reportColumn} -> ${mapping.targetColumn} [${mapping.transform || 'trim'}]`,
								)
								.join('; ')}`,
						);
					}
					const nextKeys = new Set(
						fieldMappings.map((mapping) =>
							this.makeMappingKey(mapping),
						),
					);
					mappingRows.push(
						...(existingCatalogMappingsByKey.get(catalogKey) || [])
							.filter(
								(mapping) => !nextKeys.has(mapping.mapping_key),
							)
							.map((mapping) => ({
								mapping_scope: 'catalog',
								dsp_report_id: '',
								parser_code: mapping.parser_code,
								source_category: mapping.source_category,
								config_version: 0,
								mapping_key: mapping.mapping_key,
								report_column: mapping.report_column,
								parser_column: mapping.parser_column,
								target_column: mapping.target_column,
								transform: mapping.transform,
								is_active: 0,
								updated_at: now,
							})),
					);
				}
			}
		}

		if (rows.length > 0) {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_PARSER_CATALOG,
				rows,
			);
		}
		if (mappingRows.length > 0) {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS,
				mappingRows,
			);
		}

		this.logger.log(
			`Synced ${rows.length} parser definitions from ${files.length} parser source files`,
		);
		return { filesScanned: files.length, parsersSynced: rows.length };
	}

	async findByDspReportAndCategory(
		id: string,
		category: FtpSourceCategory,
	): Promise<FtpParserConfigRecord | null> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_DSP_PARSER_CONFIGS} FINAL WHERE dsp_report_id = {id:String} AND source_category = {category:String} LIMIT 1`,
			{ id, category },
		);
		if (!rows.length) return null;
		const row = rows[0];
		return toRecord(row);
	}

	async findAllByDspReport(id: string): Promise<FtpParserConfigRecord[]> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_DSP_PARSER_CONFIGS} FINAL WHERE dsp_report_id = {id:String} ORDER BY source_category`,
			{ id },
		);
		return rows.map((row) => toRecord(row));
	}

	/** Config for a folder enriched with the parser source/mapping stored in the catalog. */
	async findAllDetailsByDspReport(
		id: string,
	): Promise<FtpParserConfigDetails[]> {
		const [configs, catalog] = await Promise.all([
			this.findAllByDspReport(id),
			this.getCatalog(),
		]);
		const byParser = new Map(
			catalog.map((item) => [
				`${item.parserCode}|${item.sourceCategory}`,
				item,
			]),
		);
		return configs.map((config) => ({
			...config,
			parser:
				byParser.get(`${config.parserCode}|${config.sourceCategory}`) ||
				null,
		}));
	}

	async upsert(
		id: string,
		category: FtpSourceCategory,
		dto: UpsertFtpParserConfigDto,
	): Promise<FtpParserConfigRecord> {
		this.assertCatalogCode(dto.parserCode, category);
		this.validatePatterns(dto.includePatterns || []);
		this.validatePatterns(dto.excludePatterns || []);
		const existing = await this.findByDspReportAndCategory(id, category);
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const record = {
			dsp_report_id: id,
			source_category: category,
			parser_code: dto.parserCode,
			include_patterns: dto.includePatterns || [],
			exclude_patterns: dto.excludePatterns || [],
			is_active: dto.isActive === false ? 0 : 1,
			description: dto.description || '',
			config_version: (existing?.configVersion ?? 0) + 1,
			created_at: existing?.createdAt || now,
			updated_at: now,
		};
		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_DSP_PARSER_CONFIGS,
			[record],
		);
		return toRecord(record);
	}

	async disable(id: string, category: FtpSourceCategory): Promise<void> {
		const existing = await this.findByDspReportAndCategory(id, category);
		if (!existing)
			throw new BadRequestException('FTP parser config not found');
		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_DSP_PARSER_CONFIGS,
			[
				{
					dsp_report_id: id,
					source_category: category,
					parser_code: existing.parserCode,
					include_patterns: existing.includePatterns,
					exclude_patterns: existing.excludePatterns,
					is_active: 0,
					description: existing.description,
					config_version: existing.configVersion + 1,
					created_at: existing.createdAt,
					updated_at: new Date()
						.toISOString()
						.slice(0, 19)
						.replace('T', ' '),
				},
			],
		);
	}

	async resolve(
		folderName: string,
		category: FtpSourceCategory,
	): Promise<ResolvedFtpParserConfig> {
		const dspReport = await this.dspMappingService.resolveOrCreateDspReport(
			folderName,
			'ftp_folder',
		);
		const config = await this.findByDspReportAndCategory(
			dspReport.id_dsps_report,
			category,
		);
		if (config?.isActive) {
			const entry = this.assertCatalogCode(config.parserCode, category);
			const fieldMappings = await this.findParserOverrideFieldMappings(
				config.parserCode,
				category,
			);
			const usesDatabaseFieldMappings = fieldMappings.length > 0;
			const legacyParser = entry.factory();
			const resolvedMappings = usesDatabaseFieldMappings
				? await this.resolveParserColumns(
						config.parserCode,
						category,
						fieldMappings,
					)
				: [];
			return this.resolved(
				dspReport,
				category,
				config.parserCode,
				usesDatabaseFieldMappings
					? this.applyDatabaseFieldMappings(
							legacyParser,
							category,
							resolvedMappings,
						)
					: legacyParser,
				config.configVersion,
				true,
				usesDatabaseFieldMappings,
				config.includePatterns,
				config.excludePatterns,
			);
		}
		const legacy = this.getLegacyEntry(folderName, category);
		return this.resolved(
			dspReport,
			category,
			legacy?.code || '',
			legacy?.factory() || null,
			0,
			false,
			false,
			[],
			[],
		);
	}

	preview(
		category: FtpSourceCategory,
		dto: UpsertFtpParserConfigDto,
		filePaths: string[],
	) {
		this.assertCatalogCode(dto.parserCode, category);
		this.validatePatterns(dto.includePatterns || []);
		this.validatePatterns(dto.excludePatterns || []);
		const select = this.makeSelector(
			dto.includePatterns || [],
			dto.excludePatterns || [],
		);
		return {
			selected: filePaths.filter(select),
			skipped: filePaths.filter((p) => !select(p)),
		};
	}

	private resolved(
		dspReport: DspsReport,
		category: FtpSourceCategory,
		parserCode: string,
		parser: FtpParser | null,
		configVersion: number,
		usesDatabaseConfig: boolean,
		usesDatabaseFieldMappings: boolean,
		includes: string[],
		excludes: string[],
	): ResolvedFtpParserConfig {
		return {
			dspReport,
			category,
			parserCode,
			parser,
			configVersion,
			usesDatabaseConfig,
			usesDatabaseFieldMappings,
			selectFile: this.makeSelector(includes, excludes),
		};
	}

	private makeSelector(
		includes: string[],
		excludes: string[],
	): (path: string) => boolean {
		const include = includes.map((p) => new RegExp(p, 'i'));
		const exclude = excludes.map((p) => new RegExp(p, 'i'));
		return (relativePath) =>
			(include.length === 0 ||
				include.some((r) => r.test(relativePath))) &&
			!exclude.some((r) => r.test(relativePath));
	}

	private async findCatalogFieldMappings(
		parserCode?: string,
		category?: FtpSourceCategory,
	): Promise<Map<string, FtpParserFieldMapping[]>> {
		const filters = ["mapping_scope = 'catalog'", 'is_active = 1'];
		const params: Record<string, unknown> = {};
		if (parserCode) {
			filters.push('parser_code = {parserCode:String}');
			params.parserCode = parserCode;
		}
		if (category) {
			filters.push('source_category = {category:String}');
			params.category = category;
		}
		const rows = await this.clickHouseService.query<any>(
			`SELECT parser_code, source_category, report_column, parser_column, target_column, transform
			 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS} FINAL
			 WHERE ${filters.join(' AND ')}
			 ORDER BY parser_code, source_category, mapping_key`,
			params,
		);
		const result = new Map<string, FtpParserFieldMapping[]>();
		for (const row of rows) {
			const key = `${row.parser_code}|${row.source_category}`;
			const mappings = result.get(key) || [];
			mappings.push({
				reportColumn: row.report_column,
				parserColumn: row.parser_column || undefined,
				targetColumn: row.target_column,
				transform: normalizeFieldTransform(row.transform),
			});
			result.set(key, mappings);
		}
		return result;
	}

	private async findParserOverrideFieldMappings(
		parserCode: string,
		category: FtpSourceCategory,
	): Promise<FtpParserFieldMapping[]> {
		const versions = await this.clickHouseService.query<{
			config_version: string | number;
		}>(
			`SELECT max(config_version) AS config_version
			 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS} FINAL
			 WHERE mapping_scope = 'parser_override'
			   AND parser_code = {parserCode:String}
			   AND source_category = {category:String}`,
			{ parserCode, category },
		);
		const configVersion = Number(versions[0]?.config_version || 0);
		if (!configVersion) return [];
		const rows = await this.clickHouseService.query<any>(
			`SELECT report_column, parser_column, target_column, transform
			 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS} FINAL
			 WHERE mapping_scope = 'parser_override'
			   AND parser_code = {parserCode:String}
			   AND source_category = {category:String}
			   AND config_version = {configVersion:UInt64}
			   AND is_active = 1
			 ORDER BY mapping_key`,
			{ parserCode, category, configVersion },
		);
		return rows.map((row) => ({
			reportColumn: row.report_column,
			parserColumn: row.parser_column || undefined,
			targetColumn: row.target_column,
			transform: row.transform || undefined,
		}));
	}

	private async findEffectiveCatalogFieldMappings(
		parserCode?: string,
		category?: FtpSourceCategory,
	): Promise<Map<string, FtpParserFieldMapping[]>> {
		const base = await this.findCatalogFieldMappings(parserCode, category);
		const filters = ["mapping_scope = 'parser_override'"];
		const params: Record<string, unknown> = {};
		if (parserCode) {
			filters.push('parser_code = {parserCode:String}');
			params.parserCode = parserCode;
		}
		if (category) {
			filters.push('source_category = {category:String}');
			params.category = category;
		}
		const rows = await this.clickHouseService.query<any>(
			`SELECT parser_code, source_category, config_version, report_column, parser_column, target_column, transform, is_active
			 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS} FINAL
			 WHERE ${filters.join(' AND ')}
			 ORDER BY parser_code, source_category, config_version, mapping_key`,
			params,
		);
		const latestVersion = new Map<string, number>();
		for (const row of rows) {
			const key = `${row.parser_code}|${row.source_category}`;
			latestVersion.set(
				key,
				Math.max(
					latestVersion.get(key) || 0,
					Number(row.config_version),
				),
			);
		}
		const effective = new Map(base);
		for (const [key, version] of latestVersion) {
			const overrides = rows
				.filter(
					(row) =>
						`${row.parser_code}|${row.source_category}` === key &&
						Number(row.config_version) === version &&
						Number(row.is_active) === 1,
				)
				.map((row) => ({
					reportColumn: row.report_column,
					parserColumn: row.parser_column || undefined,
					targetColumn: row.target_column,
					transform: row.transform || undefined,
				}));
			const byTarget = new Map(
				(effective.get(key) || []).map((mapping) => [
					mapping.targetColumn,
					mapping,
				]),
			);
			for (const mapping of overrides) {
				byTarget.set(mapping.targetColumn, mapping);
			}
			effective.set(key, Array.from(byTarget.values()));
		}
		return effective;
	}

	async updateParserFieldMappings(
		parserCode: string,
		fieldMappings: FtpParserFieldMapping[],
	): Promise<ParserCatalogRecord> {
		const entry = this.catalog.get(parserCode);
		if (!entry)
			throw new BadRequestException(
				`Unsupported parser code "${parserCode}"`,
			);
		this.validateFieldMappings(entry.category, fieldMappings);
		const latest = await this.clickHouseService.query<{
			config_version: string | number;
		}>(
			`SELECT max(config_version) AS config_version
			 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS} FINAL
			 WHERE mapping_scope = 'parser_override'
			   AND parser_code = {parserCode:String}
			   AND source_category = {category:String}`,
			{ parserCode, category: entry.category },
		);
		const configVersion = Number(latest[0]?.config_version || 0) + 1;
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const resolvedMappings = await this.resolveParserColumns(
			parserCode,
			entry.category,
			fieldMappings,
		);
		const previousVersion = configVersion - 1;
		const previousRows = previousVersion
			? await this.clickHouseService.query<any>(
					`SELECT mapping_key, report_column, parser_column, target_column, transform
					 FROM ${CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS} FINAL
					 WHERE mapping_scope = 'parser_override'
					   AND parser_code = {parserCode:String}
					   AND source_category = {category:String}
					   AND config_version = {configVersion:UInt64}
					   AND is_active = 1`,
					{
						parserCode,
						category: entry.category,
						configVersion: previousVersion,
					},
				)
			: [];
		const nextKeys = new Set(
			resolvedMappings.map((mapping) => this.makeMappingKey(mapping)),
		);
		const rows = [
			...resolvedMappings.map((mapping) => ({
				mapping_scope: 'parser_override',
				dsp_report_id: '',
				parser_code: parserCode,
				source_category: entry.category,
				config_version: configVersion,
				mapping_key: this.makeMappingKey(mapping),
				report_column: mapping.reportColumn.trim(),
				parser_column:
					mapping.parserColumn || mapping.reportColumn.trim(),
				target_column: mapping.targetColumn.trim(),
				transform: mapping.transform || 'trim',
				is_active: 1,
				updated_at: now,
			})),
			...previousRows
				.filter((mapping) => !nextKeys.has(mapping.mapping_key))
				.map((mapping) => ({
					mapping_scope: 'parser_override',
					dsp_report_id: '',
					parser_code: parserCode,
					source_category: entry.category,
					config_version: configVersion,
					mapping_key: mapping.mapping_key,
					report_column: mapping.report_column,
					parser_column: mapping.parser_column,
					target_column: mapping.target_column,
					transform: mapping.transform,
					is_active: 0,
					updated_at: now,
				})),
		];
		if (rows.length > 0) {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_PARSER_FIELD_MAPPINGS,
				rows,
			);
		}
		const catalog = await this.getCatalogByParserCode(parserCode);
		if (!catalog) throw new BadRequestException('Parser catalog not found');
		return catalog;
	}

	private async resolveParserColumns(
		parserCode: string,
		category: FtpSourceCategory,
		mappings: FtpParserFieldMapping[],
	): Promise<FtpParserFieldMapping[]> {
		const catalogMappings = await this.findCatalogFieldMappings(
			parserCode,
			category,
		);
		const parserColumnsByTarget = new Map<string, string>();
		for (const mapping of catalogMappings.get(
			`${parserCode}|${category}`,
		) || []) {
			if (!parserColumnsByTarget.has(mapping.targetColumn)) {
				parserColumnsByTarget.set(
					mapping.targetColumn,
					mapping.parserColumn || mapping.reportColumn,
				);
			}
		}
		return mappings.map((mapping) => ({
			...mapping,
			parserColumn:
				mapping.parserColumn ||
				parserColumnsByTarget.get(mapping.targetColumn) ||
				mapping.reportColumn,
		}));
	}

	private makeMappingKey(mapping: FtpParserFieldMapping): string {
		return `target:${mapping.targetColumn.trim()}:source:${mapping.reportColumn.trim()}`;
	}

	private validatePatterns(patterns: string[]) {
		for (const pattern of patterns) {
			try {
				new RegExp(pattern);
			} catch {
				throw new BadRequestException(
					`Invalid regex pattern: "${pattern}"`,
				);
			}
		}
	}

	private validateFieldMappings(
		category: FtpSourceCategory,
		mappings: FtpParserFieldMapping[],
	) {
		const seenTargets = new Set<string>();
		for (const mapping of mappings) {
			if (
				!mapping.reportColumn?.trim() ||
				!mapping.targetColumn?.trim()
			) {
				throw new BadRequestException(
					'Each field mapping needs reportColumn and targetColumn',
				);
			}
			const target = mapping.targetColumn.trim();
			if (!this.isWritableTargetColumn(category, target)) {
				throw new BadRequestException(
					`Unsupported targetColumn: "${mapping.targetColumn}"`,
				);
			}
			if (seenTargets.has(target)) {
				throw new BadRequestException(
					`Each targetColumn can be mapped only once: "${target}"`,
				);
			}
			seenTargets.add(target);
			if (
				mapping.transform &&
				!isSupportedFieldTransform(mapping.transform)
			) {
				throw new BadRequestException(
					`Unsupported field transform: "${mapping.transform}"`,
				);
			}
		}
	}

	private createDatabaseFieldMappingParser(
		category: FtpSourceCategory,
		mappings: FtpParserFieldMapping[],
	): FtpParser {
		return category === FtpSourceCategory.SALES
			? new ConfiguredSalesFieldMappingParser(mappings)
			: new ConfiguredDspFieldMappingParser(mappings, category);
	}

	private applyDatabaseFieldMappings(
		legacyParser: FtpParser,
		category: FtpSourceCategory,
		mappings: FtpParserFieldMapping[],
	): FtpParser {
		if (
			legacyParser instanceof BaseParser ||
			legacyParser instanceof BaseSalesParser
		) {
			return legacyParser.setFieldMappingOverrides(mappings);
		}
		return this.createDatabaseFieldMappingParser(category, mappings);
	}

	private isWritableTargetColumn(
		category: FtpSourceCategory,
		target: string,
	): boolean {
		if (/^metadata\.[A-Za-z_][A-Za-z0-9_]*$/.test(target)) return true;
		const dspColumns = [
			'reporting_period',
			'partner_id',
			'account_identifier',
			'licensor',
			'label_name',
			'territory_code',
			'isrc',
			'upc',
			'track_title',
			'artist_name',
			'album_title',
			'composer_name',
			'track_id_internal',
			'quantity_total',
			'quantity_unique_users',
			'quantity_invalid',
			'usage_type',
			'monetisation_type',
			'track_classification',
		];
		const salesColumns = [
			'reporting_period_start',
			'reporting_period_end',
			'service_name',
			'dpid',
			'member_name',
			'label_name',
			'territory_code',
			'isrc',
			'upc',
			'grid',
			'release_id',
			'track_title',
			'artist_name',
			'album_title',
			'composer_name',
			'genre',
			'quantity',
			'quantity_creations',
			'quantity_views',
			'revenue_usd',
			'revenue_local',
			'revenue_currency',
			'usage_type',
			'monetisation_type',
			'service_tier',
			'plan_name',
			'commercial_model',
		];
		return (
			category === FtpSourceCategory.SALES ? salesColumns : dspColumns
		).includes(target);
	}
	private assertCatalogCode(
		code: string,
		category: FtpSourceCategory,
	): CatalogEntry {
		const entry = this.catalog.get(code);
		if (!entry || entry.category !== category)
			throw new BadRequestException(
				`Unsupported parser code "${code}" for ${category}`,
			);
		return entry;
	}

	private getLegacyEntry(
		folderName: string,
		category: FtpSourceCategory,
	): CatalogEntry | null {
		const key = PARSER_REGISTRY[folderName]
			? folderName
			: folderName.split('-')[0];
		const code = `ftp.${category}.${key}`;
		return this.catalog.get(code) || null;
	}

	private getParserSourceRoot(): string | null {
		const roots = [
			path.resolve(process.cwd(), 'src', 'modules', 'etl', 'parsers'),
			path.resolve(__dirname, '..', '..', 'etl', 'parsers'),
		];
		return roots.find((root) => fs.existsSync(root)) || null;
	}

	private findParserFiles(root: string): string[] {
		const files: string[] = [];
		const visit = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) visit(fullPath);
				// Most parsers use `*.parser.ts`, while the sales parser groups
				// use `group-*-parsers.ts`. Illegitimate parsers are co-located in
				// `illegitimate/index.ts`. Include all three source layouts so the
				// generated catalog and field mappings match the runtime registry.
				else {
					const relativePath = path
						.relative(root, fullPath)
						.replace(/\\/g, '/');
					const isParserSource =
						/\.parser\.(ts|js)$/.test(entry.name) ||
						/-parsers\.(ts|js)$/.test(entry.name) ||
						relativePath === 'illegitimate/index.ts' ||
						relativePath === 'illegitimate/index.js';
					if (isParserSource) files.push(fullPath);
				}
			}
		};
		visit(root);
		return files.sort();
	}

	private extractParserDefinitions(source: string): Array<{
		parserName: string;
		parserSource: string;
	}> {
		const definitions: Array<{ parserName: string; parserSource: string }> =
			[];
		// Development scans TypeScript (`export class FooParser`); production
		// scans CommonJS output in dist (`class FooParser`). Support both.
		const classPattern =
			/(?:export\s+(?:abstract\s+)?class|class)\s+(\w+Parser)\b/g;
		for (const match of source.matchAll(classPattern)) {
			const parserName = match[1];
			if (parserName.startsWith('Base')) continue;
			const openingBrace = source.indexOf('{', match.index);
			const closingBrace = this.findMatchingBrace(source, openingBrace);
			if (openingBrace === -1 || closingBrace === -1) continue;
			definitions.push({
				parserName,
				parserSource: source.slice(match.index, closingBrace + 1),
			});
		}
		return definitions;
	}

	private findMatchingBrace(source: string, openingBrace: number): number {
		if (openingBrace < 0) return -1;
		let depth = 0;
		let quote: string | null = null;
		let lineComment = false;
		let blockComment = false;
		for (let index = openingBrace; index < source.length; index++) {
			const char = source[index];
			const next = source[index + 1];
			if (lineComment) {
				if (char === '\n') lineComment = false;
				continue;
			}
			if (blockComment) {
				if (char === '*' && next === '/') {
					blockComment = false;
					index++;
				}
				continue;
			}
			if (quote) {
				if (char === '\\') {
					index++;
					continue;
				}
				if (char === quote) quote = null;
				continue;
			}
			if (char === '/' && next === '/') {
				lineComment = true;
				index++;
				continue;
			}
			if (char === '/' && next === '*') {
				blockComment = true;
				index++;
				continue;
			}
			if (char === "'" || char === '"' || char === '`') {
				quote = char;
				continue;
			}
			if (char === '{') depth++;
			if (char === '}') {
				depth--;
				if (depth === 0) return index;
			}
		}
		return -1;
	}

	private createSourceOnlyCatalogEntry(
		parserName: string,
		sourceFile: string,
	): CatalogEntry {
		const pathSegments = sourceFile.split('/');
		const category = pathSegments.includes('sales')
			? FtpSourceCategory.SALES
			: pathSegments.includes('illegitimate')
				? FtpSourceCategory.ILLEGITIMATE_ACTIVITY
				: FtpSourceCategory.TRENDS;
		const slug = parserName
			.replace(/Parser$/, '')
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.toLowerCase();
		return {
			code: `source.${slug}`,
			category,
			label: `${category}: ${parserName}`,
			factory: () => {
				throw new Error(
					'Source-only parser is not selectable for FTP sync',
				);
			},
		};
	}

	private getTargetTable(category: FtpSourceCategory): string {
		return category === FtpSourceCategory.SALES
			? CLICKHOUSE_TABLES.FACT_SALES_REPORT
			: CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT;
	}

	private extractFieldMappings(source: string): FtpParserFieldMapping[] {
		const variables = new Map<string, string[]>();
		for (const match of source.matchAll(
			/(?:const|let)\s+(\w+)\s*=\s*([^;]+);/g,
		)) {
			const columns = this.extractReportColumns(match[2]);
			if (columns.length > 0) variables.set(match[1], columns);
		}

		const mappings: FtpParserFieldMapping[] = [];
		const addMappings = (targetColumn: string, expression: string) => {
			const reportColumns = new Set(
				this.extractReportColumns(expression),
			);
			for (const variable of expression.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
				for (const column of variables.get(variable[1]) || []) {
					reportColumns.add(column);
				}
			}
			const transform = expression.replace(/\s+/g, ' ').trim();
			for (const reportColumn of reportColumns) {
				mappings.push({
					reportColumn,
					targetColumn,
					transform: 'trim',
				});
			}
		};

		for (const match of source.matchAll(/row\.(\w+)\s*=\s*([\s\S]*?);/g)) {
			addMappings(match[1], match[2]);
		}
		for (const match of source.matchAll(
			/row\.metadata\.(\w+)\s*=\s*([\s\S]*?);/g,
		)) {
			addMappings(`metadata.${match[1]}`, match[2]);
		}

		const seen = new Set<string>();
		return mappings.filter((mapping) => {
			const key = `${mapping.reportColumn}|${mapping.targetColumn}|${mapping.transform}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	/**
	 * Parsers that merge reports expose a complete, source-labelled catalog.
	 * Their mappings must not be inferred from assignments because that loses
	 * joins, fallbacks, and duplicate header names from different files.
	 */
	private getExplicitCatalogFieldMappings(
		entry: CatalogEntry,
	): FtpParserFieldMapping[] | null {
		// Source-only entries are created from files not present in the runtime
		// registry. Their factory intentionally throws and they must continue to
		// use source scanning only.
		if (entry.code.startsWith('source.')) return null;
		const parser = entry.factory();
		if (!(parser instanceof BaseParser)) return null;

		const mappings = parser.getCatalogFieldMappings();
		if (!mappings) return null;
		return mappings.map((mapping: ParserCatalogFieldMapping) => ({
			reportColumn: mapping.reportColumn,
			parserColumn: mapping.parserColumn,
			targetColumn: mapping.targetColumn,
			transform: mapping.transform || 'trim',
		}));
	}

	private extractReportColumns(expression: string): string[] {
		return Array.from(
			expression.matchAll(/\b(?:record|r)\[['"]([^'"]+)['"]\]/g),
			(match) => match[1],
		);
	}

	private buildCatalog(): Map<string, CatalogEntry> {
		const result = new Map<string, CatalogEntry>();
		const add = (
			category: FtpSourceCategory,
			key: string,
			factory: () => FtpParser,
		) =>
			result.set(`ftp.${category}.${key}`, {
				code: `ftp.${category}.${key}`,
				category,
				label: `${category}: ${key}`,
				factory,
			});
		for (const [key, factory] of Object.entries(PARSER_REGISTRY))
			add(FtpSourceCategory.TRENDS, key, factory);
		for (const [key, factory] of Object.entries(PARSER_REGISTRY))
			add(FtpSourceCategory.USAGE, key, factory);
		for (const [key, factory] of Object.entries(SALES_PARSER_REGISTRY))
			add(FtpSourceCategory.SALES, key, factory);
		add(
			FtpSourceCategory.ILLEGITIMATE_ACTIVITY,
			'dzr',
			() => new DeezerIllegitimateParser(),
		);
		add(
			FtpSourceCategory.ILLEGITIMATE_ACTIVITY,
			'scu',
			() => new SoundCloudIllegitimateParser(),
		);
		add(
			FtpSourceCategory.ILLEGITIMATE_ACTIVITY,
			'spo',
			() => new SpotifyIllegitimateParser(),
		);
		add(
			FtpSourceCategory.ILLEGITIMATE_ACTIVITY,
			'tiktok',
			() => new TiktokIllegitimateParser(),
		);
		return result;
	}
}
