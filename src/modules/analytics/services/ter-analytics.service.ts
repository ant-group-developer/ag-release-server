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
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import {
	DspTimelineResponse,
	EntityTopDspItem,
	EntityOverviewResponse,
	RevenueLineChartItem,
	RevenueTimelineResponse,
	TrendViewLineChartItem,
} from '../interfaces/analytics.interface';
import { AnalyticsCacheService } from './analytics-cache.service';
import { DspTopTrackItem, DspTopReleaseItem } from '../interfaces/analytics.interface';

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
	private readonly resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
	private readonly dspNameJoin = `
    LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL) r ON s.dsp_id = r.id_dsps_report
    LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
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
			trackJoin = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t ON s.isrc = t.isrc`;
			if (releaseType) {
				trackFilter += ' AND t.release_type = {releaseType:String}';
				params.releaseType = releaseType;
			}
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

	async getOverview(isoCode: string, dto: EntityOverviewQueryDto): Promise<TerOverviewResponse> {
		const key = this.cache.buildKey('ter:overview', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeOverview(isoCode, dto));
	}

	private async computeOverview(isoCode: string, dto: EntityOverviewQueryDto): Promise<TerOverviewResponse> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const { terFilter, trackJoin, trackFilter, params } = this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
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
			this.clickHouseService.query<{ total_trend_views: string }>(trendSql, params),
			this.clickHouseService.query<{ total_sales_views: string; total_revenue_usd: string }>(salesSql, params),
			this.resolveCountryName(isoCode),
		]);

		return {
			isoCode: isoCode.toUpperCase(),
			territory: countryName,
			totalTrendViews: Number(trendRow?.total_trend_views ?? 0),
			totalSalesViews: Number(salesRow?.total_sales_views ?? 0),
			totalRevenueUsd: this.revenueNumber(salesRow?.total_revenue_usd),
			totalRevenueUsdExact: this.revenueExact(salesRow?.total_revenue_usd),
		};
	}

	// ── Trend view line chart ──────────────────────────────

	async getTrendViewLineChart(isoCode: string, dto: ChartQueryDto): Promise<TrendViewLineChartItem[]> {
		const key = this.cache.buildKey('ter:trend-line', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeTrendViewLineChart(isoCode, dto));
	}

	private async computeTrendViewLineChart(isoCode: string, dto: ChartQueryDto): Promise<TrendViewLineChartItem[]> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const { terFilter, trackJoin, trackFilter, params } = this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
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
		const rows = await this.clickHouseService.query<{ period: string; total_views: string }>(sql, params);
		return rows.map((r) => ({
			period: r.period.substring(0, 7),
			totalViews: Number(r.total_views),
		}));
	}

	// ── Revenue line chart ─────────────────────────────────

	async getRevenueLineChart(isoCode: string, dto: ChartQueryDto): Promise<RevenueLineChartItem[]> {
		const key = this.cache.buildKey('ter:rev-line', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeRevenueLineChart(isoCode, dto));
	}

	private async computeRevenueLineChart(isoCode: string, dto: ChartQueryDto): Promise<RevenueLineChartItem[]> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const { terFilter, trackJoin, trackFilter, params } = this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
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
		const rows = await this.clickHouseService.query<{ period: string; quantity: string; revenue_usd: string }>(sql, params);
		return rows.map((r) => ({
			period: r.period.substring(0, 7),
			revenueUsd: this.revenueNumber(r.revenue_usd),
			revenueUsdExact: this.revenueExact(r.revenue_usd),
			quantity: Number(r.quantity),
		}));
	}

	// ── Trend view DSP timeline ────────────────────────────

	async getTrendViewDspTimeline(isoCode: string, dto: EntityTimelineQueryDto): Promise<DspTimelineResponse> {
		const key = this.cache.buildKey('ter:trend-dsp-timeline', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeTrendViewDspTimeline(isoCode, dto));
	}

	private async computeTrendViewDspTimeline(isoCode: string, dto: EntityTimelineQueryDto): Promise<DspTimelineResponse> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const topN = dto.topN ?? 5;
		const { terFilter, trackJoin, trackFilter, params } = this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
		params.fromMonth = fromMonth;
		params.toMonth = toMonth;

		const topDspSql = `
			SELECT ${this.resolvedDspName} AS dsp_name
			FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
			${this.dspNameJoin}
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${trackFilter}
			GROUP BY s.dsp_id, dsp_name
			ORDER BY sum(s.total_quantity) DESC
			LIMIT ${topN}
		`;
		const topDspRows = await this.clickHouseService.query<{ dsp_name: string }>(topDspSql, params);
		const topDsps = topDspRows.map((r) => r.dsp_name);
		params.topDsps = topDsps;

		if (!topDsps.length) return { topDsps: [], items: [] };

		const timelineSql = `
			SELECT
				period,
				multiIf(dsp_name_resolved IN ({topDsps:Array(String)}), dsp_name_resolved, 'Other') AS dsp_name,
				sum(total_views) AS total_views
			FROM (
				SELECT
					toStartOfMonth(s.period) AS period,
					${this.resolvedDspName} AS dsp_name_resolved,
					sum(s.total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				${this.dspNameJoin}
				${trackJoin}
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${trackFilter}
				GROUP BY period, s.dsp_id, dsp_name_resolved
			)
			GROUP BY period, dsp_name
			ORDER BY period ASC
		`;
		const rows = await this.clickHouseService.query<{ period: string; dsp_name: string; total_views: string }>(timelineSql, params);

		const periodMap = new Map<string, Map<string, number>>();
		for (const row of rows) {
			const p = row.period.substring(0, 7);
			if (!periodMap.has(p)) periodMap.set(p, new Map());
			periodMap.get(p)!.set(row.dsp_name, Number(row.total_views));
		}
		const allDsps = dto.includeOther !== false ? [...topDsps, 'Other'] : topDsps;
		const items = Array.from(periodMap.entries()).map(([period, dspMap]) => ({
			period,
			series: allDsps
				.filter((d) => dspMap.has(d))
				.map((d) => ({ dsp: d, trendViews: dspMap.get(d) ?? 0 })),
		}));

		return { topDsps, items };
	}

	// ── Revenue timeline ───────────────────────────────────

	async getRevenueTimeline(isoCode: string, dto: EntityTimelineQueryDto): Promise<RevenueTimelineResponse> {
		const key = this.cache.buildKey('ter:rev-timeline', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeRevenueTimeline(isoCode, dto));
	}

	private async computeRevenueTimeline(isoCode: string, dto: EntityTimelineQueryDto): Promise<RevenueTimelineResponse> {
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const topN = dto.topN ?? 5;
		const { terFilter, trackJoin, trackFilter, params } = this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
		params.fromMonth = fromMonth;
		params.toMonth = toMonth;

		const topDspSql = `
			SELECT ${this.resolvedDspName} AS dsp_name
			FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
			${this.dspNameJoin}
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${trackFilter}
			GROUP BY s.dsp_id, dsp_name
			ORDER BY sum(s.total_revenue_usd) DESC
			LIMIT ${topN}
		`;
		const topDspRows = await this.clickHouseService.query<{ dsp_name: string }>(topDspSql, params);
		const topDsps = topDspRows.map((r) => r.dsp_name);
		params.topDsps = topDsps;

		if (!topDsps.length) return { topDsps: [], items: [] };

		const timelineSql = `
			SELECT
				period,
				multiIf(dsp_name_resolved IN ({topDsps:Array(String)}), dsp_name_resolved, 'Other') AS dsp_name,
				sum(revenue_usd) AS revenue_usd,
				sum(quantity) AS quantity
			FROM (
				SELECT
					toStartOfMonth(s.period) AS period,
					${this.resolvedDspName} AS dsp_name_resolved,
					sum(s.total_revenue_usd) AS revenue_usd,
					sum(s.total_quantity) AS quantity
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				${this.dspNameJoin}
				${trackJoin}
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${trackFilter}
				GROUP BY period, s.dsp_id, dsp_name_resolved
			)
			GROUP BY period, dsp_name
			ORDER BY period ASC
		`;
		const rows = await this.clickHouseService.query<{
			period: string;
			dsp_name: string;
			revenue_usd: string;
			quantity: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, { revenueUsd: number; revenueUsdExact: string; quantity: number; series: Map<string, { revenueUsd: number; revenueUsdExact: string; quantity: number }> }>();
		for (const row of rows) {
			const p = row.period.substring(0, 7);
			if (!periodMap.has(p)) {
				periodMap.set(p, { revenueUsd: 0, revenueUsdExact: '0', quantity: 0, series: new Map() });
			}
			const periodData = periodMap.get(p)!;
			const rev = this.revenueNumber(row.revenue_usd);
			const qty = Number(row.quantity);
			periodData.revenueUsd += rev;
			periodData.quantity += qty;
			periodData.series.set(row.dsp_name, { revenueUsd: rev, revenueUsdExact: this.revenueExact(row.revenue_usd), quantity: qty });
		}

		const allDsps = dto.includeOther !== false ? [...topDsps, 'Other'] : topDsps;
		const items = Array.from(periodMap.entries()).map(([period, data]) => ({
			period,
			revenueUsd: data.revenueUsd,
			revenueUsdExact: String(data.revenueUsd),
			quantity: data.quantity,
			series: allDsps
				.filter((d) => data.series.has(d))
				.map((d) => {
					const s = data.series.get(d)!;
					return { dsp: d, revenueUsd: s.revenueUsd, revenueUsdExact: s.revenueUsdExact, quantity: s.quantity };
				}),
		}));

		return { topDsps, items };
	}

	// ── Top Tracks ─────────────────────────────────────────

	async getTopTracks(isoCode: string, dto: EntityRankingQueryDto): Promise<PageDto<DspTopTrackItem>> {
		const key = this.cache.buildKey('ter:top-tracks', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeTopTracks(isoCode, dto));
	}

	private async computeTopTracks(isoCode: string, dto: EntityRankingQueryDto): Promise<PageDto<DspTopTrackItem>> {
		const page = dto.page ?? 1;
		const limit = dto.limit;
		const skip = dto.skip;
		const sortCol = dto.sortBy === 'revenue' ? 'total_revenue_usd' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const importFilter = dto.importSource ? 'AND s.import_source = {importSource:String}' : '';
		const releaseTypeFilter = dto.releaseType ? 'AND t.release_type = {releaseType:String}' : '';

		const params: Record<string, any> = {
			isoCode: isoCode.toUpperCase(),
			fromMonth,
			toMonth,
		};
		if (dto.importSource) params.importSource = dto.importSource;
		if (dto.releaseType) params.releaseType = dto.releaseType;

		const trackJoin = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t ON s.isrc = t.isrc`;
		const terFilter = 'AND s.territory_code = {isoCode:String}';

		const countSql = `
			SELECT uniq(s.isrc) AS total
			FROM (
				SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
				UNION ALL
				SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter}
			) sub
			${trackJoin}
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
			LIMIT ${limit} OFFSET ${skip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				isrc: string; track_title: string; track_version: string;
				release_id: string; release_title: string; artist_name: string;
				cover_75: string; cover_100: string; cover_160: string;
				cover_300: string; cover_original: string;
				total_views: string; total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);
		const items: DspTopTrackItem[] = dataRows.map((row, i) => ({
			rank: skip + i + 1,
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

		return new PageDto({ items, metadata: { page, pageSize: limit, totalItems } });
	}

	// ── Top Releases ───────────────────────────────────────

	async getTopReleases(isoCode: string, dto: EntityRankingQueryDto): Promise<PageDto<DspTopReleaseItem>> {
		const key = this.cache.buildKey('ter:top-releases', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeTopReleases(isoCode, dto));
	}

	private async computeTopReleases(isoCode: string, dto: EntityRankingQueryDto): Promise<PageDto<DspTopReleaseItem>> {
		const page = dto.page ?? 1;
		const limit = dto.limit;
		const skip = dto.skip;
		const sortCol = dto.sortBy === 'revenue' ? 'total_revenue_usd' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const importFilter = dto.importSource ? 'AND s.import_source = {importSource:String}' : '';
		const releaseTypeFilter = dto.releaseType ? 'AND t.release_type = {releaseType:String}' : '';

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
			LIMIT ${limit} OFFSET ${skip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				release_id: string; release_title: string; release_upc: string;
				label_id: string; label_name: string;
				cover_75: string; cover_100: string; cover_160: string;
				cover_300: string; cover_original: string;
				track_count: string; total_views: string; total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);
		const items: DspTopReleaseItem[] = dataRows.map((row, i) => ({
			rank: skip + i + 1,
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

		return new PageDto({ items, metadata: { page, pageSize: limit, totalItems } });
	}

	// ── Top DSPs ───────────────────────────────────────────

	async getTopDsps(isoCode: string, dto: EntityRankingQueryDto): Promise<PageDto<EntityTopDspItem>> {
		const key = this.cache.buildKey('ter:top-dsps', 'system', { isoCode, ...dto });
		return this.cache.wrap(key, () => this.computeTopDsps(isoCode, dto));
	}

	private async computeTopDsps(isoCode: string, dto: EntityRankingQueryDto): Promise<PageDto<EntityTopDspItem>> {
		const page = dto.page ?? 1;
		const sortByRevenue = dto.sortBy === 'revenue';
		const sortCol = sortByRevenue ? 'total_revenue_usd_raw' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);
		const importFilter = dto.importSource ? 'AND s.import_source = {importSource:String}' : '';
		const importFilterSal = dto.importSource ? 'AND sal.import_source = {importSource:String}' : '';
		const { trackJoin, trackFilter, params } = this.buildTerFilter(isoCode, dto.importSource, dto.releaseType);
		params.fromMonth = fromMonth;
		params.toMonth = toMonth;
		const terFilter = 'AND s.territory_code = {isoCode:String}';

		const primaryTable = sortByRevenue
			? CLICKHOUSE_TABLES.SALES_TER_MONTHLY
			: CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY;

		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;

		const countSql = `
			SELECT uniq(s.dsp_id) AS total
			FROM music_analytics.${primaryTable} s
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${importFilter} ${trackFilter}
		`;

		const dataSql = sortByRevenue ? `
			SELECT
				s.dsp_id AS dsp_id,
				${this.resolvedDspName} AS dsp_name,
				sum(s.total_revenue_usd) AS total_revenue_usd_raw,
				toString(sum(s.total_revenue_usd)) AS total_revenue_usd,
				coalesce(sum(tr.total_views), 0) AS total_views
			FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
			${this.dspNameJoin}
			${trackJoin}
			LEFT JOIN (
				SELECT dsp_id, isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} tr_sub
				WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
					AND tr_sub.territory_code = {isoCode:String} ${importFilterSal}
				GROUP BY dsp_id, isrc
			) tr ON s.dsp_id = tr.dsp_id AND s.isrc = tr.isrc
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${importFilter} ${trackFilter}
			GROUP BY s.dsp_id, dsp_name
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		` : `
			SELECT
				s.dsp_id AS dsp_id,
				${this.resolvedDspName} AS dsp_name,
				sum(s.total_quantity) AS total_views,
				sum(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd_raw,
				toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
			FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
			${this.dspNameJoin}
			${trackJoin}
			LEFT JOIN (
				SELECT dsp_id, isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} sal
				WHERE sal.period >= toDate({fromMonth:String}) AND sal.period <= toDate({toMonth:String})
					AND sal.territory_code = {isoCode:String} ${importFilterSal}
				GROUP BY dsp_id, isrc
			) sa ON s.dsp_id = sa.dsp_id AND s.isrc = sa.isrc
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${terFilter} ${importFilter} ${trackFilter}
			GROUP BY s.dsp_id, dsp_name
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				dsp_id: string; dsp_name: string;
				total_views: string; total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);

		if (useTopN && dto.includeOther && dataRows.length > 0) {
			const totalsSql = sortByRevenue ? `
				SELECT toString(sum(s.total_revenue_usd)) AS total_revenue_usd, sum(tr.total_views) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				${trackJoin}
				LEFT JOIN (
					SELECT dsp_id, isrc, sum(total_quantity) AS total_views
					FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} tr_sub
					WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
						AND tr_sub.territory_code = {isoCode:String} ${importFilterSal}
					GROUP BY dsp_id, isrc
				) tr ON s.dsp_id = tr.dsp_id AND s.isrc = tr.isrc
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter} ${trackFilter}
			` : `
				SELECT sum(s.total_quantity) AS total_views, toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				${trackJoin}
				LEFT JOIN (
					SELECT dsp_id, isrc, sum(total_revenue_usd) AS total_revenue_usd
					FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} sal
					WHERE sal.period >= toDate({fromMonth:String}) AND sal.period <= toDate({toMonth:String})
						AND sal.territory_code = {isoCode:String} ${importFilterSal}
					GROUP BY dsp_id, isrc
				) sa ON s.dsp_id = sa.dsp_id AND s.isrc = sa.isrc
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${terFilter} ${importFilter} ${trackFilter}
			`;
			const totalsRow = (await this.clickHouseService.query<{ total_views: string; total_revenue_usd: string }>(totalsSql, params))[0];
			const grandTotalViews = Number(totalsRow?.total_views ?? 0);
			const grandTotalRevExact = totalsRow?.total_revenue_usd ?? '0';
			const topRevSum = dataRows.reduce((s, r) => s + Number(r.total_revenue_usd), 0);
			const topViews = dataRows.reduce((s, r) => s + Number(r.total_views), 0);
			const otherRev = Math.max(0, Number(grandTotalRevExact) - topRevSum);
			const otherViews = Math.max(0, grandTotalViews - topViews);

			const items: EntityTopDspItem[] = dataRows.map((row, i) => ({
				rank: i + 1,
				dspId: row.dsp_id,
				dspName: row.dsp_name || row.dsp_id,
				totalViews: Number(row.total_views),
				totalRevenueUsd: row.total_revenue_usd || '0',
			}));
			if (otherRev > 0 || otherViews > 0) {
				items.push({
					rank: items.length + 1,
					dspId: 'other',
					dspName: 'Other',
					totalViews: otherViews,
					totalRevenueUsd: otherRev.toString(),
				});
			}
			return new PageDto({ items, metadata: { page, pageSize: topNLimit, totalItems } });
		}

		const rankOffset = useTopN ? 0 : dto.skip;
		const items: EntityTopDspItem[] = dataRows.map((row, i) => ({
			rank: rankOffset + i + 1,
			dspId: row.dsp_id,
			dspName: row.dsp_name || row.dsp_id,
			totalViews: Number(row.total_views),
			totalRevenueUsd: row.total_revenue_usd || '0',
		}));

		return new PageDto({ items, metadata: { page, pageSize: useTopN ? topNLimit : dto.limit, totalItems } });
	}
}
