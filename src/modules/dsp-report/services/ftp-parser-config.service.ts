import {
	BadRequestException,
	Injectable,
	Logger,
	OnModuleInit,
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
import { BaseParser, PARSER_REGISTRY } from '../../etl/parsers';
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
	fieldMappings: FtpParserFieldMapping[];
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
	selectFile(relativePath: string): boolean;
}

type CatalogEntry = ParserCatalogItem & { factory: () => FtpParser };

function toRecord(row: any): FtpParserConfigRecord {
	return {
		dspReportId: row.dsp_report_id,
		sourceCategory: row.source_category,
		parserCode: row.parser_code,
		includePatterns: row.include_patterns || [],
		excludePatterns: row.exclude_patterns || [],
		fieldMappings: parseFieldMappings(row.field_mappings),
		isActive: Number(row.is_active) === 1,
		description: row.description || '',
		configVersion: Number(row.config_version || 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function parseFieldMappings(value: unknown): FtpParserFieldMapping[] {
	if (Array.isArray(value)) return value as FtpParserFieldMapping[];
	if (typeof value !== 'string' || !value) return [];
	try {
		const mappings: unknown = JSON.parse(value);
		return Array.isArray(mappings)
			? (mappings as FtpParserFieldMapping[])
			: [];
	} catch {
		return [];
	}
}

function toParserCatalogRecord(row: any): ParserCatalogRecord {
	return {
		parserCode: row.parser_code,
		sourceCategory: row.source_category,
		parserName: row.parser_name,
		sourceFile: row.source_file,
		targetTable: row.target_table,
		fieldMappings: parseFieldMappings(row.field_mappings),
		parserSource: row.parser_source,
		sourceHash: row.source_hash,
		isSelectable: Number(row.is_selectable) === 1,
		syncedAt: row.synced_at,
	};
}

@Injectable()
export class FtpParserConfigService implements OnModuleInit {
	private readonly logger = new Logger(FtpParserConfigService.name);
	private readonly catalog = this.buildCatalog();

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly dspMappingService: DspMappingService,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
	) {}

	onModuleInit(): void {
		void this.seedLegacyConfigs().catch((err: Error) =>
			this.logger.error(
				`Failed to seed legacy FTP parser configs: ${err.message}`,
				err.stack,
			),
		);
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
					field_mappings: '[]',
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
			.map(({ factory, ...item }) => item)
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
		return rows.map(toParserCatalogRecord);
	}

	async getCatalogByParserCode(
		parserCode: string,
	): Promise<ParserCatalogRecord | null> {
		await this.clickHouseMigrationService.waitForMigrations();
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_PARSER_CATALOG} FINAL WHERE parser_code = {parserCode:String} AND is_active = 1 ORDER BY synced_at DESC LIMIT 1`,
			{ parserCode },
		);
		return rows.length > 0 ? toParserCatalogRecord(rows[0]) : null;
	}

	/**
	 * Reads every concrete parser source file (TypeScript in development, compiled
	 * JavaScript in production) and persists its implementation and
	 * the report-column -> fact-column mappings found in its row assignments.
	 */
	async syncParserCatalog(): Promise<{
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

		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const rows: Record<string, unknown>[] = [];
		for (const filePath of files) {
			const source = fs.readFileSync(filePath, 'utf8');
			const parserDefinitions = this.extractParserDefinitions(source);
			const sourceFile = path.relative(root, filePath).replace(/\\/g, '/');
			const sourceHash = crypto
				.createHash('sha256')
				.update(source)
				.digest('hex');

			for (const parserDefinition of parserDefinitions) {
				const { parserName, parserSource } = parserDefinition;
				const entries = knownCodes.get(parserName) || [];
				const catalogEntries = entries.length
					? entries
					: [this.createSourceOnlyCatalogEntry(parserName, sourceFile)];
				for (const entry of catalogEntries) {
					rows.push({
						parser_code: entry.code,
						source_category: entry.category,
						parser_name: parserName,
						source_file: sourceFile,
						target_table: this.getTargetTable(entry.category),
						field_mappings: JSON.stringify(
							this.extractFieldMappings(parserSource),
						),
						parser_source: source,
						source_hash: sourceHash,
						is_selectable: entries.length ? 1 : 0,
						is_active: 1,
						synced_at: now,
					});
				}
			}
		}

		if (rows.length > 0) {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.FTP_PARSER_CATALOG,
				rows,
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
		return rows.length ? toRecord(rows[0]) : null;
	}

	async findAllByDspReport(id: string): Promise<FtpParserConfigRecord[]> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_DSP_PARSER_CONFIGS} FINAL WHERE dsp_report_id = {id:String} ORDER BY source_category`,
			{ id },
		);
		return rows.map(toRecord);
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
		const fieldMappings = dto.fieldMappings ?? existing?.fieldMappings ?? [];
		this.validateFieldMappings(fieldMappings);
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const record = {
			dsp_report_id: id,
			source_category: category,
			parser_code: dto.parserCode,
			include_patterns: dto.includePatterns || [],
			exclude_patterns: dto.excludePatterns || [],
			field_mappings: JSON.stringify(fieldMappings),
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
					field_mappings: JSON.stringify(existing.fieldMappings),
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
			return this.resolved(
				dspReport,
				category,
				config.parserCode,
				entry.factory(),
				config.configVersion,
				true,
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

	private validateFieldMappings(mappings: FtpParserFieldMapping[]) {
		for (const mapping of mappings) {
			if (!mapping.reportColumn?.trim() || !mapping.targetColumn?.trim()) {
				throw new BadRequestException(
					'Each field mapping needs reportColumn and targetColumn',
				);
			}
		}
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
				else if (/\.parser\.(ts|js)$/.test(entry.name)) files.push(fullPath);
			}
		};
		visit(root);
		return files.sort();
	}

	private extractParserDefinitions(source: string): Array<{
		parserName: string;
		parserSource: string;
	}> {
		const definitions: Array<{ parserName: string; parserSource: string }> = [];
		const classPattern = /export\s+(?:abstract\s+)?class\s+(\w+Parser)\b/g;
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
			if (char === '\'' || char === '"' || char === '`') {
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
		const category = sourceFile.includes('/sales/')
			? FtpSourceCategory.SALES
			: sourceFile.includes('/illegitimate/')
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
				throw new Error('Source-only parser is not selectable for FTP sync');
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
			const reportColumns = new Set(this.extractReportColumns(expression));
			for (const variable of expression.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
				for (const column of variables.get(variable[1]) || []) {
					reportColumns.add(column);
				}
			}
			const transform = expression.replace(/\s+/g, ' ').trim();
			for (const reportColumn of reportColumns) {
				mappings.push({ reportColumn, targetColumn, transform });
			}
		};

		for (const match of source.matchAll(
			/row\.(\w+)\s*=\s*([\s\S]*?);/g,
		)) {
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

	private extractReportColumns(expression: string): string[] {
		return Array.from(
			expression.matchAll(/record\[['\"]([^'\"]+)['\"]\]/g),
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
