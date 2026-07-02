import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { EntityManager } from 'typeorm';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import {
	DspBarChartItem,
	DspTimelinePeriod,
	DspTimelineResponse,
	EntityOverviewResponse,
	RevenueLineChartItem,
	RevenueTimelineResponse,
	TerritoryBarChartItem,
	TrendViewLineChartItem,
} from '../interfaces/analytics.interface';

export type EntityType = 'release' | 'label' | 'artist' | 'track' | 'tenant' | 'channel';

@Injectable()
export class EntityAnalyticsService {
	constructor(
		private readonly clickHouseService: ClickHouseService,
		@InjectEntityManager()
		private readonly entityManager: EntityManager,
	) {}

	private revenueNumber(value?: string | null): number {
		return Number(value ?? 0);
	}

	private revenueExact(value?: string | null): string {
		return value?.toString() ?? '0';
	}

	private addRevenueExact(values: Array<string | null | undefined>): string {
		const decimals = values.map((value) => this.revenueExact(value));
		const scale = Math.max(0, ...decimals.map((value) => (value.split('.')[1] || '').length));
		let sum = 0n;

		for (const value of decimals) {
			const negative = value.trim().startsWith('-');
			const unsigned = negative ? value.trim().slice(1) : value.trim();
			const [whole = '0', frac = ''] = unsigned.split('.');
			const units = BigInt(`${whole || '0'}${frac.padEnd(scale, '0') || ''}`);
			sum += negative ? -units : units;
		}

		const negative = sum < 0n;
		const abs = negative ? -sum : sum;
		if (scale === 0) return `${negative ? '-' : ''}${abs.toString()}`;

		const padded = abs.toString().padStart(scale + 1, '0');
		const whole = padded.slice(0, -scale) || '0';
		const frac = padded.slice(-scale).replace(/0+$/, '');
		return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
	}

	private subtractRevenueExact(left?: string | null, right?: string | null): string {
		const rightValue = this.revenueExact(right);
		return this.addRevenueExact([
			left,
			rightValue.startsWith('-') ? rightValue.slice(1) : `-${rightValue}`,
		]);
	}

	// ─────────────────────────────────────────────────────
	// Helper: build JOIN + WHERE scoped theo entity + tenant
	// ─────────────────────────────────────────────────────

	private buildEntityFilters(
		tenantId: string,
		entityType: EntityType,
		entityId?: string,
		releaseType?: 'audio' | 'video',
	): {
		joinSql: string;
		filterSql: string;
		params: Record<string, any>;
	} {
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = { entityId };

		// Track + system tenant without releaseType: filter on s.isrc, no JOIN needed
		if (entityType === 'track' && isSystem && !releaseType) {
			return {
				joinSql: '',
				filterSql: 'AND s.isrc = {entityId:String}',
				params,
			};
		}

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem && entityType !== 'tenant') {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		switch (entityType) {
			case 'release':
				filterSql += ' AND t.release_id = {entityId:String}';
				break;
			case 'label':
				filterSql += ' AND t.label_id = {entityId:String}';
				break;
			case 'artist':
				filterSql += ' AND has(t.artist_ids, {entityId:String})';
				break;
			case 'track':
				filterSql += ' AND s.isrc = {entityId:String}';
				break;
			case 'tenant':
				filterSql += ' AND t.tenant_id = {entityId:String}';
				break;
			case 'channel':
				filterSql += ' AND t.channel_id = {entityId:String}';
				break;
		}

		if (releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = releaseType;
		}

		return { joinSql, filterSql, params };
	}

	// DSP name resolution constants (dùng lại pattern từ global-timeline.service)
	private readonly resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
	private readonly dspNameJoin = `
    LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
    LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
  `;

	private async mapTerritoryCodesToCountryNames(
		items: TerritoryBarChartItem[],
	): Promise<TerritoryBarChartItem[]> {
		const iso2Codes = Array.from(
			new Set(
				items
					.map((item) => item.territory?.trim().toUpperCase())
					.filter((territory): territory is string =>
						!!territory && territory !== 'OTHER',
					),
			),
		);

		if (!iso2Codes.length) return items;

		const countries = (await this.entityManager.query(
			`
        SELECT UPPER(iso2) AS iso2, name
        FROM countries
        WHERE UPPER(iso2) = ANY($1)
      `,
			[iso2Codes],
		)) as Array<{
			iso2: string;
			name: string;
		}>;
		const countryNameByIso2 = new Map(
			countries.map((country) => [country.iso2, country.name]),
		);

		return items.map((item) => {
			const iso2 = item.territory?.trim().toUpperCase();
			return {
				...item,
				territory:
					iso2 && iso2 !== 'OTHER'
						? countryNameByIso2.get(iso2) ?? item.territory
						: item.territory,
			};
		});
	}

	// ─────────────────────────────────────────────────────
	// OVERVIEW (tổng trend views + sales views + revenue)
	// 2 query song song: trends_dsp_monthly + sales_dsp_monthly
	// ─────────────────────────────────────────────────────

	async getOverview(
		entityType: EntityType,
		entityId: string,
		dto: EntityOverviewQueryDto,
		tenantId: string,
	): Promise<EntityOverviewResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const trendSql = `
      SELECT sum(s.total_quantity) AS total_trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
		const salesSql = `
      SELECT
        sum(s.total_quantity) AS total_sales_views,
        sum(s.total_revenue_usd) AS total_revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;

		const [trendRows, salesRows] = await Promise.all([
			this.clickHouseService.query<{ total_trend_views: string }>(
				trendSql,
				params,
			),
			this.clickHouseService.query<{
				total_sales_views: string;
				total_revenue_usd: string;
			}>(salesSql, params),
		]);

		let artistMeta = null;
		if (entityType === 'artist') {
			const artist = await this.entityManager.findOne(Artist, {
				where: { id: entityId },
				relations: ['artistProfiles', 'artistProfiles.dsp', 'country', 'genre'],
			});
			if (artist) {
				const domain = process.env.R2_PUBLIC_BASE_URL || 'default.com';
				let pictureUrl: string | null = null;
				if (artist.picture) {
					pictureUrl = artist.picture.startsWith('http')
						? artist.picture
						: `${domain}/${artist.picture}`;
				}
				const profiles = (artist.artistProfiles ?? [])
					.filter((p) => p.url)
					.map((p) => ({
						dspCode: p.dsp?.code ?? '',
						dspName: p.dsp?.name ?? '',
						url: p.url,
					}));
				artistMeta = {
					id: artist.id,
					name: artist.name,
					picture: pictureUrl,
					profiles,
					country: artist.country?.name ?? artist.originCountry ?? null,
					genre: artist.genre?.name ?? artist.primaryGenre ?? null,
				};
			}
		}

		let tenantMeta = null;
		if (entityType === 'tenant' && entityId) {
			const tenant = await this.entityManager.findOne(Tenant, {
				where: { id: entityId },
				select: ['id', 'name', 'title', 'logo'],
			});
			if (tenant) {
				tenantMeta = {
					id: tenant.id,
					name: tenant.name,
					title: tenant.title || tenant.name,
					logo: tenant.logo || null,
				};
			}
		}

		return {
			totalTrendViews: Number(trendRows[0]?.total_trend_views ?? 0),
			totalSalesViews: Number(salesRows[0]?.total_sales_views ?? 0),
			totalRevenueUsd: this.revenueNumber(salesRows[0]?.total_revenue_usd),
			totalRevenueUsdExact: this.revenueExact(salesRows[0]?.total_revenue_usd),
			artist: artistMeta,
			tenant: tenantMeta,
		};
	}

	// ─────────────────────────────────────────────────────
	// TREND VIEW DSP TIMELINE (monthly)
	// Table: trends_dsp_monthly_cube | period column: period
	// ─────────────────────────────────────────────────────
	async getTrendViewDspTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<DspTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, trend_views DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			trend_views: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, p);
			}
			p.series.push({
				dsp: row.dsp_name,
				trendViews: Number(row.trend_views),
			});
		}
		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ─────────────────────────────────────────────────────
	// SALES VIEW DSP TIMELINE (monthly)
	// Table: sales_dsp_monthly_cube_v2 | period column: period
	// ─────────────────────────────────────────────────────
	async getSalesViewDspTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<DspTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS sales_views,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, sales_views DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			sales_views: string;
			revenue_usd: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, p);
			}
			p.series.push({
				dsp: row.dsp_name,
				salesViews: Number(row.sales_views),
				revenueUsd: this.revenueNumber(row.revenue_usd),
				revenueUsdExact: this.revenueExact(row.revenue_usd),
			});
		}
		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ─────────────────────────────────────────────────────
	// TREND VIEW DSP DAILY TIMELINE
	// Table: trends_dsp_daily_cube | date column: reporting_date
	// ─────────────────────────────────────────────────────
	async getTrendViewDspDailyTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<DspTimelineResponse> {
		const { fromDate, toDate, topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        s.reporting_date AS period_date,
        formatDateTime(s.reporting_date, '%Y-%m-%d') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, trend_views DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			trend_views: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, p);
			}
			p.series.push({
				dsp: row.dsp_name,
				trendViews: Number(row.trend_views),
			});
		}
		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ─────────────────────────────────────────────────────
	// REVENUE TIMELINE (monthly, DSP breakdown)
	// Table: sales_dsp_monthly_cube_v2
	// ─────────────────────────────────────────────────────
	async getRevenueTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<RevenueTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_revenue_usd) AS revenue
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY revenue DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS quantity,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, revenue_usd DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			quantity: string;
			revenue_usd: string;
		}>(timelineSql, params);

		const periodMap = new Map<
			string,
			{
				revenueUsdExactParts: string[];
				quantity: number;
				series: { dsp: string; revenueUsd: number; revenueUsdExact: string; quantity: number }[];
			}
		>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { revenueUsdExactParts: [], quantity: 0, series: [] };
				periodMap.set(row.period_str, p);
			}
			const revExact = this.revenueExact(row.revenue_usd);
			const rev = this.revenueNumber(row.revenue_usd);
			const qty = Number(row.quantity);
			p.revenueUsdExactParts.push(revExact);
			p.quantity += qty;
			p.series.push({
				dsp: row.dsp_name,
				revenueUsd: rev,
				revenueUsdExact: revExact,
				quantity: qty,
			});
		}
		return {
			topDsps,
			items: Array.from(periodMap.entries()).map(([key, val]) => ({
				period: key,
				revenueUsd: this.revenueNumber(this.addRevenueExact(val.revenueUsdExactParts)),
				revenueUsdExact: this.addRevenueExact(val.revenueUsdExactParts),
				quantity: val.quantity,
				series: val.series,
			})),
		};
	}

	async getTrendViewLineChart(
		entityType: EntityType,
		entityId: string,
		dto: ChartQueryDto,
		tenantId: string,
	): Promise<TrendViewLineChartItem[]> {
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = dto.fromDate;
		params.to = dto.toDate;

		const sql = `
      SELECT
        formatDateTime(toStartOfMonth(s.reporting_date), '%Y-%m') AS period,
        sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${filterSql}
      GROUP BY period
      ORDER BY period ASC
    `;
		const rows = await this.clickHouseService.query<{
			period: string;
			total_views: string;
		}>(sql, params);

		return rows.map((row) => ({
			period: row.period,
			totalViews: Number(row.total_views),
		}));
	}

	async getRevenueLineChart(
		entityType: EntityType,
		entityId: string,
		dto: ChartQueryDto,
		tenantId: string,
	): Promise<RevenueLineChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const sql = `
      SELECT
        formatDateTime(s.period, '%Y-%m') AS period,
        sum(s.total_revenue_usd) AS revenue_usd,
        sum(s.total_quantity) AS quantity
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY period
      ORDER BY period ASC
    `;
		const rows = await this.clickHouseService.query<{
			period: string;
			revenue_usd: string;
			quantity: string;
		}>(sql, params);

		return rows.map((row) => ({
			period: row.period,
			revenueUsd: this.revenueNumber(row.revenue_usd),
			revenueUsdExact: this.revenueExact(row.revenue_usd),
			quantity: Number(row.quantity),
		}));
	}

	async getTrendViewDspBarChart(
		entityType: EntityType,
		entityId: string,
		dto: ChartQueryDto,
		tenantId: string,
	): Promise<DspBarChartItem[]> {
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = dto.fromDate;
		params.to = dto.toDate;

		const totalSql = `
      SELECT sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${filterSql}
    `;
		const totalRows = await this.clickHouseService.query<{ total_views: string }>(
			totalSql,
			params,
		);
		const grandTotal = Number(totalRows[0]?.total_views ?? 0);

		const sql = `
      SELECT
        ${this.resolvedDspName} AS dsp_name,
        sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${filterSql}
      GROUP BY dsp_name
      ORDER BY total_views DESC
      LIMIT 5
    `;
		const rows = await this.clickHouseService.query<{
			dsp_name: string;
			total_views: string;
		}>(sql, params);

		const items: DspBarChartItem[] = rows.map((row) => ({
			dspName: row.dsp_name,
			totalViews: Number(row.total_views),
		}));
		const top5Total = items.reduce((acc, item) => acc + (item.totalViews ?? 0), 0);
		const otherViews = grandTotal - top5Total;
		if (otherViews > 0) {
			items.push({ dspName: 'Other', totalViews: otherViews });
		}

		return items;
	}

	async getTrendViewTerritoryBarChart(
		entityType: EntityType,
		entityId: string,
		dto: ChartQueryDto,
		tenantId: string,
	): Promise<TerritoryBarChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const totalSql = `
      SELECT sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
		const totalRows = await this.clickHouseService.query<{ total_views: string }>(
			totalSql,
			params,
		);
		const grandTotal = Number(totalRows[0]?.total_views ?? 0);

		const sql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY territory
      ORDER BY total_views DESC
      LIMIT 5
    `;
		const rows = await this.clickHouseService.query<{
			territory: string;
			total_views: string;
		}>(sql, params);

		const items: TerritoryBarChartItem[] = rows.map((row) => ({
			territory: row.territory,
			totalViews: Number(row.total_views),
		}));
		const top5Total = items.reduce((acc, item) => acc + (item.totalViews ?? 0), 0);
		const otherViews = grandTotal - top5Total;
		if (otherViews > 0) {
			items.push({ territory: 'Other', totalViews: otherViews });
		}

		return this.mapTerritoryCodesToCountryNames(items);
	}

	async getRevenueDspBarChart(
		entityType: EntityType,
		entityId: string,
		dto: ChartQueryDto,
		tenantId: string,
	): Promise<DspBarChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const totalSql = `
      SELECT sum(s.total_revenue_usd) AS total_rev
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
		const totalRows = await this.clickHouseService.query<{ total_rev: string }>(
			totalSql,
			params,
		);
		const grandTotalExact = this.revenueExact(totalRows[0]?.total_rev);

		const sql = `
      SELECT
        ${this.resolvedDspName} AS dsp_name,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY dsp_name
      ORDER BY revenue_usd DESC
      LIMIT 5
    `;
		const rows = await this.clickHouseService.query<{
			dsp_name: string;
			revenue_usd: string;
		}>(sql, params);

		const items: DspBarChartItem[] = rows.map((row) => ({
			dspName: row.dsp_name,
			revenueUsd: this.revenueNumber(row.revenue_usd),
			revenueUsdExact: this.revenueExact(row.revenue_usd),
		}));
		const top5TotalExact = this.addRevenueExact(
			items.map((item) => item.revenueUsdExact),
		);
		const otherRevExact = this.subtractRevenueExact(
			grandTotalExact,
			top5TotalExact,
		);
		const otherRev = this.revenueNumber(otherRevExact);
		if (otherRev > 0) {
			items.push({
				dspName: 'Other',
				revenueUsd: otherRev,
				revenueUsdExact: otherRevExact,
			});
		}

		return items;
	}

	async getRevenueTerritoryBarChart(
		entityType: EntityType,
		entityId: string,
		dto: ChartQueryDto,
		tenantId: string,
	): Promise<TerritoryBarChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
			dto.releaseType,
		);
		params.from = fromDate;
		params.to = toDate;

		const totalSql = `
      SELECT sum(s.total_revenue_usd) AS total_rev
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
		const totalRows = await this.clickHouseService.query<{ total_rev: string }>(
			totalSql,
			params,
		);
		const grandTotalExact = this.revenueExact(totalRows[0]?.total_rev);

		const sql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY territory
      ORDER BY revenue_usd DESC
      LIMIT 5
    `;
		const rows = await this.clickHouseService.query<{
			territory: string;
			revenue_usd: string;
		}>(sql, params);

		const items: TerritoryBarChartItem[] = rows.map((row) => ({
			territory: row.territory,
			revenueUsd: this.revenueNumber(row.revenue_usd),
			revenueUsdExact: this.revenueExact(row.revenue_usd),
		}));
		const top5TotalExact = this.addRevenueExact(
			items.map((item) => item.revenueUsdExact),
		);
		const otherRevExact = this.subtractRevenueExact(
			grandTotalExact,
			top5TotalExact,
		);
		const otherRev = this.revenueNumber(otherRevExact);
		if (otherRev > 0) {
			items.push({
				territory: 'Other',
				revenueUsd: otherRev,
				revenueUsdExact: otherRevExact,
			});
		}

		return this.mapTerritoryCodesToCountryNames(items);
	}
}
