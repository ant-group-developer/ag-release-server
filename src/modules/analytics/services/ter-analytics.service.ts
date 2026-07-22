import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { EntityManager } from 'typeorm';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
} from '../dto/analytics-query.dto';
import {
	DspTopReleaseItem,
	DspTopTrackItem,
	EntityTopDspItem,
	RevenueLineChartItem,
	TrendViewLineChartItem,
} from '../interfaces/analytics.interface';
import { AnalyticsCacheService } from './analytics-cache.service';

export interface TerOverviewResponse {
	isoCode: string;
	territory: string;
	totalTrendViews: number;
	totalSalesViews: number;
	totalRevenueUsd: number;
	totalRevenueUsdExact: string;
}

@Injectable()
export class TerAnalyticsService {
	// s.dsp_id is only resolvable when s is a subquery result (not raw table with JOINs).
	// All queries using dspNameJoin must use buildTrendsSource() as their FROM clause.
	private readonly resolvedDspName = `coalesce(nullIf(dsp_map.resolved_dsp_name, ''), s.dsp_id)`;
	private readonly dspNameJoin = `
    LEFT JOIN (
      SELECT r.id_dsps_report AS dsp_key, r.pg_uuid AS pg_uuid, coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, '')) AS resolved_dsp_name
      FROM (SELECT id_dsps_report, pg_uuid, dsp_name FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL) r
      LEFT JOIN (SELECT pg_uuid, dsp_name FROM music_analytics.${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
    ) dsp_map ON s.dsp_id = dsp_map.dsp_key
  `;

	constructor(
		private readonly clickHouseService: ClickHouseService,
		@InjectEntityManager()
		private readonly entityManager: EntityManager,
		private readonly cache: AnalyticsCacheService,
	) {}

	private revenueNumber(value?: string | null): number {
		return Number(value ?? 0);
	}

	private revenueExact(value?: string | null): string {
		return value?.toString() ?? '0';
	}

	private buildTrendsSource(
		isoCode: string,
		fromMonth: string,
		toMonth: string,
		importSource?: string,
		releaseType?: string,
	): { fromClause: string; params: Record<string, any> } {
		const params: Record<string, any> = {
			isoCode: isoCode.toUpperCase(),
			fromMonth,
			toMonth,
		};
		let where = `period >= toDate({fromMonth:String}) AND period <= toDate({toMonth:String}) AND territory_code = {isoCode:String}`;
		if (importSource) {
			where += ' AND import_source = {importSource:String}';
			params.importSource = importSource;
		}
		if (releaseType) {
			where += ` AND isrc IN (SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0 AND release_type = {releaseType:String})`;
			params.releaseType = releaseType;
		}
		const fromClause = `(SELECT dsp_id, isrc, period, territory_code, import_source, total_quantity FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} WHERE ${where}) s`;
		return { fromClause, params };
	}

	private buildTerFilter(
		isoCode: string,
		importSource?: string,
		releaseType?: string,
	): {
		terFilter: string;
		trackJoin: string;
		trackFilter: string;
		params: Record<string, any>;
	} {
		const params: Record<string, any> = { isoCode: isoCode.toUpperCase() };
		let terFilter = 'AND s.territory_code = {isoCode:String}';

		let trackJoin = '';
		let trackFilter = '';
		if (releaseType || importSource) {
			// Use IN subquery instead of JOIN to avoid ClickHouse scope collapse on s.dsp_id
			// when combined with dspNameJoin (3+ chained JOINs break alias resolution).
			const trackWhere = releaseType
				? `WHERE is_deleted = 0 AND release_type = {releaseType:String}`
				: `WHERE is_deleted = 0`;
			trackFilter = ` AND s.isrc IN (SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL ${trackWhere})`;
			if (releaseType) params.releaseType = releaseType;
		}
		if (importSource) {
			terFilter += ' AND s.import_source = {importSource:String}';
			params.importSource = importSource;
		}

		return { terFilter, trackJoin, trackFilter, params };
	}

	private async resolveCountryName(isoCode: string): Promise<string> {
		const rows = await this.entityManager.query(
			`SELECT name FROM countries WHERE UPPER(iso2) = $1 LIMIT 1`,
			[isoCode.toUpperCase()],
		);
		return rows[0]?.name ?? isoCode;
	}

	// ── Overview ──────────────────────────────────────────

	async getOverview(
		isoCode: string,
		dto: EntityOverviewQueryDto,
	): Promise<TerOverviewResponse> {
		const key = this.cache.buildKey('ter:overview', 'system', {
			isoCode,
			...dto,
		});
		return this.cache.wrap(key, () => this.computeOverview(isoCode, dto));
	}

	private async computeOverview(
		isoCode: string,
		dto: EntityOverviewQueryDto,
	): Promise<TerOverviewResponse> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const { terFilter, trackJoin, trackFilter, params } =
			this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
		params.fromMonth = fromMonth;
		params.toMonth = toMonth;

		const trendSql = `
			SELECT sum(s.total_quantity) AS total_trend_views
			FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${trackFilter}
		`;
		const salesSql = `
			SELECT sum(s.total_quantity) AS total_sales_views, sum(s.total_revenue_usd) AS total_revenue_usd
			FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${trackFilter}
		`;

		const [[trendRow], [salesRow], countryName] = await Promise.all([
			this.clickHouseService.query<{ total_trend_views: string }>(
				trendSql,
				params,
			),
			this.clickHouseService.query<{
				total_sales_views: string;
				total_revenue_usd: string;
			}>(salesSql, params),
			this.resolveCountryName(isoCode),
		]);

		return {
			isoCode: isoCode.toUpperCase(),
			territory: countryName,
			totalTrendViews: Number(trendRow?.total_trend_views ?? 0),
			totalSalesViews: Number(salesRow?.total_sales_views ?? 0),
			totalRevenueUsd: this.revenueNumber(salesRow?.total_revenue_usd),
			totalRevenueUsdExact: this.revenueExact(
				salesRow?.total_revenue_usd,
			),
		};
	}

	// ── Trend view line chart ──────────────────────────────

	async getTrendViewLineChart(
		isoCode: string,
		dto: ChartQueryDto,
	): Promise<TrendViewLineChartItem[]> {
		const key = this.cache.buildKey('ter:trend-line', 'system', {
			isoCode,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeTrendViewLineChart(isoCode, dto),
		);
	}

	private async computeTrendViewLineChart(
		isoCode: string,
		dto: ChartQueryDto,
	): Promise<TrendViewLineChartItem[]> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const { terFilter, trackJoin, trackFilter, params } =
			this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
		params.fromMonth = fromMonth;
		params.toMonth = toMonth;

		const sql = `
			SELECT
				toStartOfMonth(s.period) AS period,
				sum(s.total_quantity) AS total_views
			FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${trackFilter}
			GROUP BY period
			ORDER BY period ASC
		`;
		const rows = await this.clickHouseService.query<{
			period: string;
			total_views: string;
		}>(sql, params);
		return rows.map((r) => ({
			period: r.period.substring(0, 7),
			totalViews: Number(r.total_views),
		}));
	}

	// ── Revenue line chart ─────────────────────────────────

	async getRevenueLineChart(
		isoCode: string,
		dto: ChartQueryDto,
	): Promise<RevenueLineChartItem[]> {
		const key = this.cache.buildKey('ter:rev-line', 'system', {
			isoCode,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeRevenueLineChart(isoCode, dto),
		);
	}

	private async computeRevenueLineChart(
		isoCode: string,
		dto: ChartQueryDto,
	): Promise<RevenueLineChartItem[]> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const { terFilter, trackJoin, trackFilter, params } =
			this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
		params.fromMonth = fromMonth;
		params.toMonth = toMonth;

		const sql = `
			SELECT
				toStartOfMonth(s.period) AS period,
				sum(s.total_quantity) AS quantity,
				sum(s.total_revenue_usd) AS revenue_usd
			FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${trackFilter}
			GROUP BY period
			ORDER BY period ASC
		`;
		const rows = await this.clickHouseService.query<{
			period: string;
			quantity: string;
			revenue_usd: string;
		}>(sql, params);
		return rows.map((r) => ({
			period: r.period.substring(0, 7),
			revenueUsd: this.revenueNumber(r.revenue_usd),
			revenueUsdExact: this.revenueExact(r.revenue_usd),
			quantity: Number(r.quantity),
		}));
	}

	// ── Trend view DSP timeline ────────────────────────────

	// ── Revenue timeline ───────────────────────────────────

	// ── Top Tracks ─────────────────────────────────────────

	async getTopTracks(
		isoCode: string,
		dto: EntityRankingQueryDto,
	): Promise<PageDto<DspTopTrackItem>> {
		const key = this.cache.buildKey('ter:top-tracks', 'system', {
			isoCode,
			...dto,
		});
		return this.cache.wrap(key, () => this.computeTopTracks(isoCode, dto));
	}

	private async computeTopTracks(
		isoCode: string,
		dto: EntityRankingQueryDto,
	): Promise<PageDto<DspTopTrackItem>> {
		const page = dto.page ?? 1;
		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;
		const sortByRevenue = dto.sortBy === 'revenue';
		const sortCol = sortByRevenue ? 'total_revenue_usd_raw' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const importFilter = dto.importSource
			? 'AND s.import_source = {importSource:String}'
			: '';
		const releaseTypeFilter = dto.releaseType
			? 'AND t.release_type = {releaseType:String}'
			: '';

		const params: Record<string, any> = {
			isoCode: isoCode.toUpperCase(),
			fromMonth,
			toMonth,
		};
		if (dto.importSource) params.importSource = dto.importSource;
		if (dto.releaseType) params.releaseType = dto.releaseType;

		const trackJoin = `INNER JOIN (SELECT isrc, release_type, release_id FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t ON s.isrc = t.isrc`;
		const terFilter = 'AND s.territory_code = {isoCode:String}';

		const countSql = `
			SELECT uniq(sub.isrc) AS total
			FROM (
				SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				UNION ALL
				SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
			) sub
			INNER JOIN (SELECT isrc, release_type FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t ON sub.isrc = t.isrc
			WHERE 1 = 1 ${releaseTypeFilter}
		`;

		const dataSql = `
			SELECT
				t.isrc AS isrc,
				t.track_title AS track_title,
				t.track_version AS track_version,
				t.release_id AS release_id,
				t.release_title AS release_title,
				arrayStringConcat(t.artist_names, ', ') AS artist_name,
				t.cover_75, t.cover_100, t.cover_160, t.cover_300, t.cover_original,
				coalesce(tr.total_views, 0) AS total_views,
				coalesce(sa.total_revenue_usd, 0) AS total_revenue_usd_raw,
				toString(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd
			FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
			LEFT JOIN (
				SELECT isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				GROUP BY isrc
			) tr ON t.isrc = tr.isrc
			LEFT JOIN (
				SELECT isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				GROUP BY isrc
			) sa ON t.isrc = sa.isrc
			WHERE (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
				${releaseTypeFilter}
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				isrc: string;
				track_title: string;
				track_version: string;
				release_id: string;
				release_title: string;
				artist_name: string;
				cover_75: string;
				cover_100: string;
				cover_160: string;
				cover_300: string;
				cover_original: string;
				total_views: string;
				total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);
		const rankOffset = useTopN ? 0 : dto.skip;
		const items: DspTopTrackItem[] = dataRows.map((row, i) => ({
			rank: rankOffset + i + 1,
			isrc: row.isrc,
			title: row.track_title || '',
			version: row.track_version || null,
			artistName: row.artist_name || '',
			releaseId: row.release_id || '',
			releaseTitle: row.release_title || '',
			totalViews: Number(row.total_views),
			totalRevenueUsd: row.total_revenue_usd || '0',
			release: {
				coverArtThumbnails: {
					'75x75': row.cover_75 || null,
					'100x100': row.cover_100 || null,
					'160x160': row.cover_160 || null,
					'300x300': row.cover_300 || null,
					original: row.cover_original || null,
				},
			},
		}));

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize: useTopN ? topNLimit : dto.limit,
				totalItems,
			},
		});
	}

	// ── Top Releases ───────────────────────────────────────

	async getTopReleases(
		isoCode: string,
		dto: EntityRankingQueryDto,
	): Promise<PageDto<DspTopReleaseItem>> {
		const key = this.cache.buildKey('ter:top-releases', 'system', {
			isoCode,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeTopReleases(isoCode, dto),
		);
	}

	private async computeTopReleases(
		isoCode: string,
		dto: EntityRankingQueryDto,
	): Promise<PageDto<DspTopReleaseItem>> {
		const page = dto.page ?? 1;
		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;
		const sortByRevenue = dto.sortBy === 'revenue';
		const sortCol = sortByRevenue ? 'total_revenue_usd_raw' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const importFilter = dto.importSource
			? 'AND s.import_source = {importSource:String}'
			: '';
		const releaseTypeFilter = dto.releaseType
			? 'AND t.release_type = {releaseType:String}'
			: '';

		const params: Record<string, any> = {
			isoCode: isoCode.toUpperCase(),
			fromMonth,
			toMonth,
		};
		if (dto.importSource) params.importSource = dto.importSource;
		if (dto.releaseType) params.releaseType = dto.releaseType;

		const terFilter = 'AND s.territory_code = {isoCode:String}';

		const countSql = `
			SELECT uniq(t.release_id) AS total
			FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
			LEFT JOIN (
				SELECT isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				GROUP BY isrc
			) tr ON t.isrc = tr.isrc
			LEFT JOIN (
				SELECT isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				GROUP BY isrc
			) sa ON t.isrc = sa.isrc
			WHERE (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
				AND t.release_id != '' ${releaseTypeFilter}
		`;

		const dataSql = `
			SELECT
				t.release_id, any(t.release_title) AS release_title, any(t.release_upc) AS release_upc,
				any(t.label_id) AS label_id, any(t.label_name) AS label_name,
				any(t.cover_75) AS cover_75, any(t.cover_100) AS cover_100,
				any(t.cover_160) AS cover_160, any(t.cover_300) AS cover_300,
				any(t.cover_original) AS cover_original,
				uniq(t.isrc) AS track_count,
				sum(coalesce(tr.total_views, 0)) AS total_views,
				sum(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd_raw,
				toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
			FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
			LEFT JOIN (
				SELECT isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				GROUP BY isrc
			) tr ON t.isrc = tr.isrc
			LEFT JOIN (
				SELECT isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				GROUP BY isrc
			) sa ON t.isrc = sa.isrc
			WHERE (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
				AND t.release_id != '' ${releaseTypeFilter}
			GROUP BY t.release_id
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				release_id: string;
				release_title: string;
				release_upc: string;
				label_id: string;
				label_name: string;
				cover_75: string;
				cover_100: string;
				cover_160: string;
				cover_300: string;
				cover_original: string;
				track_count: string;
				total_views: string;
				total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);
		const rankOffset = useTopN ? 0 : dto.skip;
		const items: DspTopReleaseItem[] = dataRows.map((row, i) => ({
			rank: rankOffset + i + 1,
			releaseId: row.release_id,
			title: row.release_title || '',
			upc: row.release_upc || null,
			labelId: row.label_id || null,
			labelName: row.label_name || null,
			trackCount: Number(row.track_count),
			totalViews: Number(row.total_views),
			totalRevenueUsd: row.total_revenue_usd || '0',
			release: {
				coverArtThumbnails: {
					'75x75': row.cover_75 || null,
					'100x100': row.cover_100 || null,
					'160x160': row.cover_160 || null,
					'300x300': row.cover_300 || null,
					original: row.cover_original || null,
				},
			},
		}));

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize: useTopN ? topNLimit : dto.limit,
				totalItems,
			},
		});
	}

	// ── Top DSPs ───────────────────────────────────────────

	async getTopDsps(
		isoCode: string,
		dto: EntityRankingQueryDto,
	): Promise<PageDto<EntityTopDspItem>> {
		const key = this.cache.buildKey('ter:top-dsps', 'system', {
			isoCode,
			...dto,
		});
		return this.cache.wrap(key, () => this.computeTopDsps(isoCode, dto));
	}

	private async computeTopDsps(
		isoCode: string,
		dto: EntityRankingQueryDto,
	): Promise<PageDto<EntityTopDspItem>> {
		const page = dto.page ?? 1;
		const sortByRevenue = dto.sortBy === 'revenue';
		const sortCol = sortByRevenue ? 'total_revenue_usd_raw' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const { fromClause, params } = this.buildTrendsSource(
			isoCode,
			fromMonth,
			toMonth,
			dto.importSource,
			dto.releaseType,
		);

		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;

		const countSql = `
			SELECT uniq(s.dsp_id) AS total
			FROM ${fromClause}
		`;

		const importFilterSalWhere = dto.importSource
			? `AND import_source = {importSource:String}`
			: '';

		const dataSql = `
			SELECT
				s.dsp_id AS dsp_id,
				dsp_map.pg_uuid AS pg_dsp_id,
				${this.resolvedDspName} AS dsp_name,
				sum(s.total_quantity) AS total_views,
				sum(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd_raw,
				toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
			FROM ${fromClause}
			${this.dspNameJoin}
			LEFT JOIN (
				SELECT territory_code AS sal_ter, dsp_id AS sal_dsp_id, isrc AS sal_isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}
				WHERE period >= toDate({fromMonth:String}) AND period <= toDate({toMonth:String})
					${importFilterSalWhere}
				GROUP BY territory_code, dsp_id, isrc
			) sa ON s.territory_code = sa.sal_ter AND s.dsp_id = sa.sal_dsp_id AND s.isrc = sa.sal_isrc
			GROUP BY s.dsp_id, dsp_map.pg_uuid, dsp_name
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				dsp_id: string;
				pg_dsp_id: string | null;
				dsp_name: string;
				total_views: string;
				total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);

		if (useTopN && dto.includeOther && dataRows.length > 0) {
			const totalsSql = `
				SELECT sum(s.total_quantity) AS total_views, toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
				FROM ${fromClause}
				LEFT JOIN (
					SELECT territory_code AS sal_ter, dsp_id AS sal_dsp_id, isrc AS sal_isrc, sum(total_revenue_usd) AS total_revenue_usd
					FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}
					WHERE period >= toDate({fromMonth:String}) AND period <= toDate({toMonth:String})
						${importFilterSalWhere}
					GROUP BY territory_code, dsp_id, isrc
				) sa ON s.territory_code = sa.sal_ter AND s.dsp_id = sa.sal_dsp_id AND s.isrc = sa.sal_isrc
			`;
			const totalsRow = (
				await this.clickHouseService.query<{
					total_views: string;
					total_revenue_usd: string;
				}>(totalsSql, params)
			)[0];
			const grandTotalViews = Number(totalsRow?.total_views ?? 0);
			const grandTotalRevExact = totalsRow?.total_revenue_usd ?? '0';
			const topRevSum = dataRows.reduce(
				(s, r) => s + Number(r.total_revenue_usd),
				0,
			);
			const topViews = dataRows.reduce(
				(s, r) => s + Number(r.total_views),
				0,
			);
			const otherRev = Math.max(
				0,
				Number(grandTotalRevExact) - topRevSum,
			);
			const otherViews = Math.max(0, grandTotalViews - topViews);

			const items: EntityTopDspItem[] = dataRows.map((row, i) => ({
				rank: i + 1,
				pgDspId: row.pg_dsp_id || null,
				dspReportId: row.dsp_id,
				dspName: row.dsp_name || row.dsp_id,
				totalViews: Number(row.total_views),
				totalRevenueUsd: row.total_revenue_usd || '0',
			}));
			if (otherRev > 0 || otherViews > 0) {
				items.push({
					rank: items.length + 1,
					pgDspId: null,
					dspReportId: 'other',
					dspName: 'Other',
					totalViews: otherViews,
					totalRevenueUsd: otherRev.toString(),
				});
			}
			return new PageDto({
				items,
				metadata: { page, pageSize: topNLimit, totalItems },
			});
		}

		const rankOffset = useTopN ? 0 : dto.skip;
		const items: EntityTopDspItem[] = dataRows.map((row, i) => ({
			rank: rankOffset + i + 1,
			pgDspId: row.pg_dsp_id || null,
			dspReportId: row.dsp_id,
			dspName: row.dsp_name || row.dsp_id,
			totalViews: Number(row.total_views),
			totalRevenueUsd: row.total_revenue_usd || '0',
		}));

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize: useTopN ? topNLimit : dto.limit,
				totalItems,
			},
		});
	}
}
