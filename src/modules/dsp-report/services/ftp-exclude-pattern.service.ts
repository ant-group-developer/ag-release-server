import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { v4 as uuidv4 } from 'uuid';
import {
	CreateExcludePatternDto,
	QueryExcludePatternDto,
	UpdateExcludePatternDto,
} from '../dto/ftp-exclude-pattern.dto';

export interface ExcludePatternRecord {
	id: string;
	pattern: string;
	patternType: string;
	scope: string[];
	isActive: number;
	description: string;
	isDeleted: number;
	createdAt: string;
	updatedAt: string;
}

type CompiledMatcher = {
	scope: string;
	match: (name: string) => boolean;
};

function mapRow(row: any): ExcludePatternRecord {
	let scopeArr: string[] = [];
	if (Array.isArray(row.scope)) {
		scopeArr = row.scope;
	} else if (typeof row.scope === 'string') {
		scopeArr = row.scope
			.split(',')
			.map((s: string) => s.trim())
			.filter(Boolean);
	}
	return {
		id: row.id,
		pattern: row.pattern,
		patternType: row.pattern_type,
		scope: scopeArr,
		isActive: Number(row.is_active),
		description: row.description ?? '',
		isDeleted: Number(row.is_deleted),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

@Injectable()
export class ExcludePatternService {
	private readonly logger = new Logger(ExcludePatternService.name);

	/** In-memory cache, cleared on any write */
	private cachedMatchers: CompiledMatcher[] | null = null;
	private excludeEnabledCache: boolean | null = null;
	private cacheLoadedAt = 0;
	private readonly CACHE_TTL_MS = 30_000;

	constructor(private readonly clickHouseService: ClickHouseService) {}

	// ── CRUD ───────────────────────────────────────────────

	async findAll(
		query: QueryExcludePatternDto,
	): Promise<PageDto<ExcludePatternRecord>> {
		const { page, pageSize, keyword, patternType, isActive, scope } = query;
		const offset = (page - 1) * pageSize;
		const conditions: string[] = ['is_deleted = 0'];
		const params: Record<string, unknown> = {};

		if (keyword) {
			conditions.push(
				'(lower(pattern) LIKE {kw:String} OR lower(description) LIKE {kw:String})',
			);
			params.kw = `%${keyword.toLowerCase()}%`;
		}
		if (patternType) {
			conditions.push('pattern_type = {patternType:String}');
			params.patternType = patternType;
		}
		if (isActive !== undefined) {
			conditions.push('is_active = {isActive:UInt8}');
			params.isActive = isActive;
		}
		if (scope && scope.length > 0) {
			conditions.push(
				"hasAll(splitByChar(',', scope), {scopeArr:Array(String)})",
			);
			params.scopeArr = scope;
		}

		const where = `WHERE ${conditions.join(' AND ')}`;

		const countRows = await this.clickHouseService.query<{ c: string }>(
			`SELECT count() AS c FROM ${CLICKHOUSE_TABLES.FTP_EXCLUDE_PATTERNS} FINAL ${where}`,
			params,
		);
		const totalItems = Number(countRows[0]?.c ?? 0);

		const rows = await this.clickHouseService.query<any>(
			`SELECT id, pattern, pattern_type, scope, is_active, description, is_deleted, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.FTP_EXCLUDE_PATTERNS} FINAL
       ${where}
       ORDER BY created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
			params,
		);

		return new PageDto({
			items: rows.map(mapRow),
			metadata: { page, pageSize, totalItems },
		});
	}

	async findById(id: string): Promise<ExcludePatternRecord | null> {
		const rows = await this.clickHouseService.query<any>(
			`SELECT id, pattern, pattern_type, scope, is_active, description, is_deleted, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.FTP_EXCLUDE_PATTERNS} FINAL
       WHERE id = {id:String} AND is_deleted = 0`,
			{ id },
		);
		return rows.length > 0 ? mapRow(rows[0]) : null;
	}

	async create(dto: CreateExcludePatternDto): Promise<ExcludePatternRecord> {
		if (dto.patternType === 'regex') {
			this.validateRegex(dto.pattern);
		}

		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const record = {
			id: uuidv4(),
			pattern: dto.pattern,
			pattern_type: dto.patternType,
			scope: (dto.scope ?? []).join(','),
			is_active: dto.isActive !== false ? 1 : 0,
			description: dto.description ?? '',
			is_deleted: 0,
			created_at: now,
			updated_at: now,
		};

		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_EXCLUDE_PATTERNS,
			[record],
		);
		this.clearCache();
		this.logger.log(
			`Created exclude pattern: ${record.id} — ${dto.patternType}:"${dto.pattern}" scope=${record.scope}`,
		);

		return mapRow({
			...record,
			is_active: record.is_active,
			is_deleted: 0,
		});
	}

	async update(
		id: string,
		dto: UpdateExcludePatternDto,
	): Promise<ExcludePatternRecord> {
		const existing = await this.findById(id);
		if (!existing) {
			throw new BadRequestException(`Pattern ${id} not found`);
		}

		const newPatternType = dto.patternType ?? existing.patternType;
		const newPattern = dto.pattern ?? existing.pattern;
		const newScope =
			dto.scope !== undefined
				? dto.scope.join(',')
				: existing.scope.join(',');
		if (newPatternType === 'regex') {
			this.validateRegex(newPattern);
		}

		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const record = {
			id,
			pattern: newPattern,
			pattern_type: newPatternType,
			scope: newScope,
			is_active:
				dto.isActive !== undefined
					? dto.isActive
						? 1
						: 0
					: existing.isActive,
			description:
				dto.description !== undefined
					? dto.description
					: existing.description,
			is_deleted: 0,
			created_at: existing.createdAt,
			updated_at: now,
		};

		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_EXCLUDE_PATTERNS,
			[record],
		);
		this.clearCache();
		this.logger.log(`Updated exclude pattern: ${id}`);

		return mapRow(record);
	}

	async remove(id: string): Promise<void> {
		const existing = await this.findById(id);
		if (!existing) {
			throw new BadRequestException(`Pattern ${id} not found`);
		}

		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
		// Soft delete: insert row với is_deleted=1, ReplacingMergeTree dedup theo updated_at
		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.FTP_EXCLUDE_PATTERNS,
			[
				{
					id,
					pattern: existing.pattern,
					pattern_type: existing.patternType,
					scope: existing.scope.join(','),
					is_active: existing.isActive,
					description: existing.description,
					is_deleted: 1,
					created_at: existing.createdAt,
					updated_at: now,
				},
			],
		);
		this.clearCache();
		this.logger.log(`Removed exclude pattern: ${id}`);
	}

	// ── Matching ───────────────────────────────────────────

	async shouldExclude(
		name: string,
		kind: 'folder' | 'file',
	): Promise<boolean> {
		const now = Date.now();
		if (
			this.excludeEnabledCache === null ||
			now - this.cacheLoadedAt >= this.CACHE_TTL_MS
		) {
			const configRows = await this.clickHouseService.query<{
				value: string;
			}>(
				`SELECT value FROM etl_config FINAL WHERE key = 'sync_exclude_enabled' LIMIT 1`,
			);
			this.excludeEnabledCache =
				configRows.length > 0 ? configRows[0].value !== 'false' : true;
		}
		if (!this.excludeEnabledCache) {
			return false;
		}

		const matchers = await this.getCompiledMatchers();
		for (const m of matchers) {
			const scopes = m.scope
				.split(',')
				.map((s: string) => s.trim())
				.filter(Boolean);
			if (!scopes.includes(kind)) continue;
			if (m.match(name)) return true;
		}
		return false;
	}

	/**
	 * Trả về compiled matchers, dùng cache TTL 30s.
	 */
	private async getCompiledMatchers(): Promise<CompiledMatcher[]> {
		const now = Date.now();
		if (
			this.cachedMatchers &&
			now - this.cacheLoadedAt < this.CACHE_TTL_MS
		) {
			return this.cachedMatchers;
		}

		const rows = await this.clickHouseService.query<any>(
			`SELECT pattern, pattern_type, scope
       FROM ${CLICKHOUSE_TABLES.FTP_EXCLUDE_PATTERNS} FINAL
       WHERE is_active = 1 AND is_deleted = 0`,
		);

		const matchers: CompiledMatcher[] = [];
		for (const row of rows) {
			const patternType: string = row.pattern_type;
			const scope: string = row.scope;
			const rawPattern: string = row.pattern;

			if (patternType === 'regex') {
				try {
					const re = new RegExp(rawPattern, 'i');
					matchers.push({ scope, match: (n) => re.test(n) });
				} catch (err) {
					this.logger.warn(
						`Invalid regex pattern "${rawPattern}", skipping: ${err.message}`,
					);
				}
			} else {
				// contains (case-insensitive)
				const lower = rawPattern.toLowerCase();
				matchers.push({
					scope,
					match: (n) => n.toLowerCase().includes(lower),
				});
			}
		}

		this.cachedMatchers = matchers;
		this.cacheLoadedAt = now;
		return matchers;
	}

	clearCache(): void {
		this.cachedMatchers = null;
		this.excludeEnabledCache = null;
		this.cacheLoadedAt = 0;
	}

	// ── Helpers ────────────────────────────────────────────

	private validateRegex(pattern: string): void {
		try {
			new RegExp(pattern);
		} catch {
			throw new BadRequestException(
				`Invalid regex pattern: "${pattern}"`,
			);
		}
	}
}
