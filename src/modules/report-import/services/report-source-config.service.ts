import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import {
	readReportConfigExtensions,
	validateReportConfig,
	writeReportConfigExtensions,
} from '../configs/report-config.util';
import { ReportSourceConfig } from '../configs/report-source.interface';
import {
	CreateReportSourceConfigDto,
	QueryGetListReportSourceConfigDto,
	UpdateReportSourceConfigDto,
} from '../dto/report-source-config.dto';

@Injectable()
export class ReportSourceConfigService {
	private readonly logger = new Logger(ReportSourceConfigService.name);

	constructor(private readonly clickHouseService: ClickHouseService) {}

	private validate(config: Partial<ReportSourceConfig>) {
		try {
			validateReportConfig({
				...config,
				delimiter: config.delimiter ?? ',',
			});
		} catch (error) {
			throw new BadRequestException((error as Error).message);
		}
	}

	/**
	 * Get single config by ID
	 */
	async getOne(id: string) {
		const rows = await this.clickHouseService.query<any>(
			`SELECT * FROM music_analytics.report_source_configs FINAL WHERE id = {id:String} AND is_active = 1 LIMIT 1`,
			{ id },
		);
		if (!rows || rows.length === 0) {
			throw new ResponseError({
				statusCode: 404,
				message: `Không tìm thấy cấu hình nguồn báo cáo với ID: ${id}`,
				messageCode: 'report.config.not.found',
			});
		}
		const r = rows[0];
		return {
			...readReportConfigExtensions(r),
			id: r.id,
			sourceCode: r.source_code,
			sourceName: r.source_name,
			reportType: r.report_type,
			folderPatterns: r.folder_patterns,
			filePatterns: r.file_patterns,
			requiredHeaders: r.required_headers,
			parserCode: r.parser_code,
			delimiter: r.delimiter,
			defaultCurrency: r.default_currency,
			defaultMember: r.default_member,
			priority: Number(r.priority),
			createdAt: r.created_at,
			updatedAt: r.updated_at,
		};
	}

	/**
	 * Get list of active configs
	 */
	async getList(query: QueryGetListReportSourceConfigDto) {
		const limit = Number(query.limit || 20);
		const offset = Number(query.skip || 0);
		let filterSql = 'WHERE is_active = 1';
		const params: Record<string, any> = {};

		if (query.keyword) {
			filterSql +=
				' AND (source_code ILIKE {keyword:String} OR source_name ILIKE {keyword:String})';
			params.keyword = `%${query.keyword}%`;
		}

		const countSql = `SELECT count() AS total FROM music_analytics.report_source_configs FINAL ${filterSql}`;
		const dataSql = `
      SELECT * FROM music_analytics.report_source_configs FINAL
      ${filterSql}
      ORDER BY priority ASC, updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<any>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);

		// Map ClickHouse snake_case fields back to camelCase
		const items = dataRows.map((r) => ({
			...readReportConfigExtensions(r),
			id: r.id,
			sourceCode: r.source_code,
			sourceName: r.source_name,
			reportType: r.report_type,
			folderPatterns: r.folder_patterns,
			filePatterns: r.file_patterns,
			requiredHeaders: r.required_headers,
			parserCode: r.parser_code,
			delimiter: r.delimiter,
			defaultCurrency: r.default_currency,
			defaultMember: r.default_member,
			priority: Number(r.priority),
			createdAt: r.created_at,
			updatedAt: r.updated_at,
		}));

		return {
			items,
			totalItems,
		};
	}

	/**
	 * Create new config
	 */
	async create(dto: CreateReportSourceConfigDto) {
		this.validate(dto);
		const id = `${dto.sourceCode}_${dto.reportType}`;

		const existing = await this.clickHouseService.query<any>(
			`SELECT id FROM music_analytics.report_source_configs FINAL WHERE id = {id:String} AND is_active = 1 LIMIT 1`,
			{ id },
		);
		if (existing.length > 0) {
			throw new ResponseError({
				statusCode: 400,
				message: `Cấu hình cho nguồn '${dto.sourceCode}' với loại báo cáo '${dto.reportType}' đã tồn tại.`,
				messageCode: 'report.config.already.exists',
			});
		}

		const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const row = {
			...writeReportConfigExtensions(dto),
			id,
			source_code: dto.sourceCode,
			source_name: dto.sourceName,
			report_type: dto.reportType,
			folder_patterns: dto.folderPatterns || [],
			file_patterns: dto.filePatterns,
			required_headers: dto.requiredHeaders,
			parser_code: dto.parserCode,
			delimiter: dto.delimiter ?? ',',
			default_currency: dto.defaultCurrency ?? '',
			default_member: dto.defaultMember ?? '',
			priority: Number(dto.priority ?? 100),
			is_active: 1,
			created_at: nowStr,
			updated_at: nowStr,
		};

		await this.clickHouseService.insertBatched(
			'report_source_configs',
			[row],
			1,
		);

		return {
			id,
			...dto,
			createdAt: nowStr,
			updatedAt: nowStr,
		};
	}

	/**
	 * Update existing config
	 */
	async update(id: string, dto: UpdateReportSourceConfigDto) {
		const existing = await this.getOne(id);
		const merged = {
			...existing,
			...Object.fromEntries(
				Object.entries(dto).filter(([, v]) => v !== undefined),
			),
		};
		this.validate(merged);

		const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const row = {
			...writeReportConfigExtensions(merged),
			id,
			source_code: dto.sourceCode ?? existing.sourceCode,
			source_name: dto.sourceName ?? existing.sourceName,
			report_type: dto.reportType ?? existing.reportType,
			folder_patterns: dto.folderPatterns ?? existing.folderPatterns,
			file_patterns: dto.filePatterns ?? existing.filePatterns,
			required_headers: dto.requiredHeaders ?? existing.requiredHeaders,
			parser_code: dto.parserCode ?? existing.parserCode,
			delimiter: dto.delimiter ?? existing.delimiter,
			default_currency: dto.defaultCurrency ?? existing.defaultCurrency,
			default_member: dto.defaultMember ?? existing.defaultMember,
			priority:
				dto.priority !== undefined
					? Number(dto.priority)
					: Number(existing.priority),
			is_active: 1,
			created_at: existing.createdAt,
			updated_at: nowStr,
		};

		await this.clickHouseService.insertBatched(
			'report_source_configs',
			[row],
			1,
		);

		return {
			id,
			sourceCode: row.source_code,
			...readReportConfigExtensions(row),
			sourceName: row.source_name,
			reportType: row.report_type,
			folderPatterns: row.folder_patterns,
			filePatterns: row.file_patterns,
			requiredHeaders: row.required_headers,
			parserCode: row.parser_code,
			delimiter: row.delimiter,
			defaultCurrency: row.default_currency,
			defaultMember: row.default_member,
			priority: row.priority,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	/**
	 * Delete config (soft delete in ReplacingMergeTree)
	 */
	async delete(id: string) {
		const existing = await this.getOne(id);

		const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const row = {
			...writeReportConfigExtensions(existing),
			id: existing.id,
			source_code: existing.sourceCode,
			source_name: existing.sourceName,
			report_type: existing.reportType,
			folder_patterns: existing.folderPatterns,
			file_patterns: existing.filePatterns,
			required_headers: existing.requiredHeaders,
			parser_code: existing.parserCode,
			delimiter: existing.delimiter,
			default_currency: existing.defaultCurrency,
			default_member: existing.defaultMember,
			priority: Number(existing.priority),
			is_active: 0,
			created_at: existing.createdAt,
			updated_at: nowStr,
		};

		await this.clickHouseService.insertBatched(
			'report_source_configs',
			[row],
			1,
		);

		return { success: true };
	}
}
