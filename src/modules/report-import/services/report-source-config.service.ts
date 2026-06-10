import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import {
  CreateReportSourceConfigDto,
  UpdateReportSourceConfigDto,
  QueryGetListReportSourceConfigDto,
} from '../dto/report-source-config.dto';

@Injectable()
export class ReportSourceConfigService {
  private readonly logger = new Logger(ReportSourceConfigService.name);

  constructor(private readonly clickHouseService: ClickHouseService) {}

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
    return rows[0];
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
      filterSql += ' AND (source_code ILIKE {keyword:String} OR source_name ILIKE {keyword:String})';
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

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const row = {
      id,
      source_code: dto.sourceCode ?? existing.source_code,
      source_name: dto.sourceName ?? existing.source_name,
      report_type: dto.reportType ?? existing.report_type,
      folder_patterns: dto.folderPatterns ?? existing.folder_patterns,
      file_patterns: dto.filePatterns ?? existing.file_patterns,
      required_headers: dto.requiredHeaders ?? existing.required_headers,
      parser_code: dto.parserCode ?? existing.parser_code,
      delimiter: dto.delimiter ?? existing.delimiter,
      default_currency: dto.defaultCurrency ?? existing.default_currency,
      default_member: dto.defaultMember ?? existing.default_member,
      priority: dto.priority !== undefined ? Number(dto.priority) : Number(existing.priority),
      is_active: 1,
      created_at: existing.created_at,
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
      id: existing.id,
      source_code: existing.source_code,
      source_name: existing.source_name,
      report_type: existing.report_type,
      folder_patterns: existing.folder_patterns,
      file_patterns: existing.file_patterns,
      required_headers: existing.required_headers,
      parser_code: existing.parser_code,
      delimiter: existing.delimiter,
      default_currency: existing.default_currency,
      default_member: existing.default_member,
      priority: Number(existing.priority),
      is_active: 0,
      created_at: existing.created_at,
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
