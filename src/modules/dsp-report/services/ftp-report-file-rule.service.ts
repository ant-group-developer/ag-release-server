import { BadRequestException, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CLICKHOUSE_TABLES, ClickHouseService } from '../../clickhouse';
import { BucketR2Service } from '../../bucket2/services/bucket-r2.service';
import { FtpSourceCategory } from '../dto/ftp-parser-config.dto';
import {
	FtpReportFileRuleStatus,
	QueryFtpReportFileRulesDto,
	UpsertFtpReportFileRuleDto,
} from '../dto/ftp-report-file-rule.dto';
import { FtpParserConfigService } from './ftp-parser-config.service';

export interface FtpReportFileRule {
	id: string;
	source: string;
	sourceCategory: FtpSourceCategory;
	dspFolderPattern: string;
	fileNamePattern: string;
	status: FtpReportFileRuleStatus;
	parserCode: string;
	description: string;
	configVersion: number;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
	sampleFiles?: Array<{ ftpPath: string; key: string; fileName: string; url: string }>;
}

export interface ResolvedFtpReportFiles {
	selected: string[];
	pending: string[];
	ignored: string[];
	parserCode: string | null;
}

function toRule(row: any): FtpReportFileRule {
	return {
		id: row.id,
		source: row.source,
		sourceCategory: row.source_category,
		dspFolderPattern: row.dsp_folder_pattern,
		fileNamePattern: row.file_name_pattern,
		status: row.status,
		parserCode: row.parser_code || '',
		description: row.description || '',
		configVersion: Number(row.config_version || 0),
		isActive: Number(row.is_active) === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

@Injectable()
export class FtpReportFileRuleService {
	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly parserConfigService: FtpParserConfigService,
		private readonly bucketR2Service: BucketR2Service,
	) {}

	async list(query: QueryFtpReportFileRulesDto): Promise<{
		items: FtpReportFileRule[];
		totalItems: number;
	}> {
		const filters = ['is_active = 1'];
		const params: Record<string, unknown> = {};
		if (query.source) {
			filters.push('source = {source:String}');
			params.source = query.source;
		}
		if (query.sourceCategory) {
			filters.push('source_category = {sourceCategory:String}');
			params.sourceCategory = query.sourceCategory;
		}
		if (query.status) {
			filters.push('status = {status:String}');
			params.status = query.status;
		}
		if (query.dspFolder) {
			filters.push('positionCaseInsensitive(dsp_folder_pattern, {dspFolder:String}) > 0');
			params.dspFolder = query.dspFolder;
		}
		const where = filters.join(' AND ');
		const pageSize = Math.min(Math.max(query.pageSize || 50, 1), 200);
		const offset = Math.max((query.page || 1) - 1, 0) * pageSize;
		const [rows, totals] = await Promise.all([
			this.clickHouseService.query<any>(
				`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} FINAL WHERE ${where}
				 ORDER BY source, source_category, dsp_folder_pattern, file_name_pattern LIMIT {limit:UInt64} OFFSET {offset:UInt64}`,
				{ ...params, limit: pageSize, offset },
			),
			this.clickHouseService.query<{ total: string }>(
				`SELECT count() AS total FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} FINAL WHERE ${where}`,
				params,
			),
		]);
		return { items: await this.attachSampleFiles(rows.map(toRule)), totalItems: Number(totals[0]?.total || 0) };
	}

	async findById(id: string): Promise<FtpReportFileRule | null> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} FINAL WHERE id = {id:String} LIMIT 1`,
			{ id },
		);
		return rows[0] ? (await this.attachSampleFiles([toRule(rows[0])]))[0] : null;
	}

	async upsert(dto: UpsertFtpReportFileRuleDto, id?: string): Promise<FtpReportFileRule> {
		this.assertRegex(dto.dspFolderPattern, 'dspFolderPattern');
		this.assertRegex(dto.fileNamePattern, 'fileNamePattern');
		if (dto.status === FtpReportFileRuleStatus.IMPORT) {
			if (!dto.parserCode) throw new BadRequestException('parserCode is required when status is import');
			const parser = await this.parserConfigService.getCatalogByParserCode(dto.parserCode);
			if (!parser || parser.sourceCategory !== dto.sourceCategory || !parser.isSelectable)
				throw new BadRequestException('parserCode is not selectable for this sourceCategory');
		}
		const existing = id ? await this.findById(id) : null;
		if (id && !existing) throw new BadRequestException('FTP report file rule not found');
		await this.assertNoObservedOverlap(dto, id);
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const row = {
			id: id || uuidv4(), source: dto.source, source_category: dto.sourceCategory,
			dsp_folder_pattern: dto.dspFolderPattern, file_name_pattern: dto.fileNamePattern,
			status: dto.status, parser_code: dto.status === FtpReportFileRuleStatus.IMPORT ? dto.parserCode || '' : '',
			description: dto.description || '', config_version: (existing?.configVersion || 0) + 1,
			is_active: 1, created_at: existing?.createdAt || now, updated_at: now,
		};
		await this.clickHouseService.insert(CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES, [row]);
		return toRule(row);
	}

	async disable(id: string): Promise<void> {
		const existing = await this.findById(id);
		if (!existing) throw new BadRequestException('FTP report file rule not found');
		await this.clickHouseService.insert(CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES, [{
			id: existing.id, source: existing.source, source_category: existing.sourceCategory,
			dsp_folder_pattern: existing.dspFolderPattern, file_name_pattern: existing.fileNamePattern,
			status: existing.status, parser_code: existing.parserCode, description: existing.description,
			config_version: existing.configVersion + 1, is_active: 0, created_at: existing.createdAt,
			updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
		}]);
	}

	async resolveFiles(source: string, category: FtpSourceCategory, dspFolder: string, files: string[]): Promise<ResolvedFtpReportFiles> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} FINAL
			 WHERE source = {source:String} AND source_category = {category:String} AND is_active = 1`,
			{ source, category },
		);
		const rules = rows.map(toRule).filter((rule) => this.matches(rule.dspFolderPattern, dspFolder));
		const selected: string[] = [], pending: string[] = [], ignored: string[] = [];
		const parserCodes = new Set<string>();
		for (const file of files) {
			const matches = rules.filter((rule) => this.matches(rule.fileNamePattern, file));
			if (matches.length > 1) throw new BadRequestException(`More than one FTP rule matches ${category}/${dspFolder}/${file}`);
			const rule = matches[0];
			if (!rule || rule.status === FtpReportFileRuleStatus.PENDING) { pending.push(file); continue; }
			if (rule.status === FtpReportFileRuleStatus.IGNORE) { ignored.push(file); continue; }
			selected.push(file);
			parserCodes.add(rule.parserCode);
		}
		if (parserCodes.size > 1) throw new BadRequestException(`Import rules for ${category}/${dspFolder} use different parsers; configure one parser per folder`);
		return { selected, pending, ignored, parserCode: parserCodes.values().next().value || null };
	}

	async ensureDiscoveredRules(
		source: string,
		category: FtpSourceCategory,
		dspFolder: string,
		patterns: Array<{ pattern: string; samples: string[] }>,
	): Promise<number> {
		let created = 0;
		let legacy: Awaited<ReturnType<FtpParserConfigService['resolve']>> | null = null;
		try { legacy = await this.parserConfigService.resolve(dspFolder, category); } catch { /* leave unknown files pending */ }
		for (const item of patterns) {
			const fileNamePattern = item.pattern;
			const existing = await this.clickHouseService.query<any>(
				`SELECT id FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} FINAL
				 WHERE source = {source:String} AND source_category = {category:String}
				 AND dsp_folder_pattern = {folder:String} AND file_name_pattern = {file:String} AND is_active = 1 LIMIT 1`,
				{ source, category, folder: `^${this.escapeRegex(dspFolder)}$`, file: fileNamePattern },
			);
			if (existing.length) continue;
			const selections = legacy?.usesDatabaseConfig
				? item.samples.map((sample) => legacy!.selectFile(sample))
				: [];
			const status = selections.length && selections.every(Boolean)
				? FtpReportFileRuleStatus.IMPORT
				: selections.length && selections.every((value) => !value)
					? FtpReportFileRuleStatus.IGNORE
					: FtpReportFileRuleStatus.PENDING;
			await this.upsert({
				source, sourceCategory: category,
				dspFolderPattern: `^${this.escapeRegex(dspFolder)}$`, fileNamePattern, status,
				parserCode: status === FtpReportFileRuleStatus.IMPORT ? legacy?.parserCode : undefined,
				description: status === FtpReportFileRuleStatus.PENDING ? 'Awaiting admin confirmation from FTP discovery' : 'Migrated from ftp_dsp_parser_configs',
			});
			created++;
		}
		return created;
	}

	private async assertNoObservedOverlap(dto: UpsertFtpReportFileRuleDto, id?: string): Promise<void> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT id, dsp_folder_pattern, file_name_pattern FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_RULES} FINAL
			 WHERE source = {source:String} AND source_category = {category:String} AND is_active = 1`,
			{ source: dto.source, category: dto.sourceCategory },
		);
		const samples = await this.clickHouseService.query<{ dsp_folder: string; sample_file_paths: string[] }>(
			`SELECT dsp_folder, sample_file_paths FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} FINAL
			 WHERE source = {source:String} AND source_category = {category:String}`,
			{ source: dto.source, category: dto.sourceCategory },
		);
		for (const rule of rows.filter((item) => item.id !== id)) for (const sample of samples) for (const file of sample.sample_file_paths || []) {
			if (this.matches(dto.dspFolderPattern, sample.dsp_folder) && this.matches(dto.fileNamePattern, file) && this.matches(rule.dsp_folder_pattern, sample.dsp_folder) && this.matches(rule.file_name_pattern, file))
				throw new BadRequestException(`Rule overlaps existing rule ${rule.id} for observed file ${sample.dsp_folder}/${file}`);
		}
	}

	private async attachSampleFiles(rules: FtpReportFileRule[]): Promise<FtpReportFileRule[]> {
		if (!rules.length) return rules;
		const catalog = await this.clickHouseService.query<any>(`SELECT source, source_category, dsp_folder, file_name_pattern, sample_file_refs FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} FINAL WHERE source = 'ftp'`);
		const tasks = await this.clickHouseService.query<any>(`SELECT source, source_category, dsp_folder, file_name_pattern, ftp_path, r2_key FROM ${CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS} FINAL WHERE status = 'completed'`);
		return Promise.all(rules.map(async (rule) => {
			const row = catalog.find((item) => item.source === rule.source && item.source_category === rule.sourceCategory && item.dsp_folder === rule.dspFolderPattern.replace(/^\^|\$$/g, '') && item.file_name_pattern === rule.fileNamePattern);
			const refs = (row?.sample_file_refs || []).flatMap((raw: string) => { try { return [JSON.parse(raw)]; } catch { return []; } });
			if (!refs.length) refs.push(...tasks.filter((task) => task.source === rule.source && task.source_category === rule.sourceCategory && task.dsp_folder === rule.dspFolderPattern.replace(/^\^|\$$/g, '') && task.file_name_pattern === rule.fileNamePattern).slice(0, 2).map((task) => ({ ftpPath: task.ftp_path, r2Key: task.r2_key, fileName: task.ftp_path.split('/').pop() })));
			return {
				...rule,
				sampleFiles: await Promise.all(refs.map(async (ref: { ftpPath: string; r2Key: string; fileName: string }) => ({
					ftpPath: ref.ftpPath, key: ref.r2Key, fileName: ref.fileName,
					url: await this.bucketR2Service.getSignedUrlDown({ key: ref.r2Key, isPublic: false, fileName: ref.fileName }),
				}))),
			};
		}));
	}

	private assertRegex(pattern: string, field: string): void { try { new RegExp(pattern); } catch { throw new BadRequestException(`${field} must be a valid regular expression`); } }
	private matches(pattern: string, value: string): boolean { return new RegExp(pattern, 'i').test(value); }
	private escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
}
