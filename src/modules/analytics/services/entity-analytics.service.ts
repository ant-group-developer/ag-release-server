import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { EntityManager } from 'typeorm';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import {
	DspBarChartItem,
	DspTimelinePeriod,
	DspTimelineResponse,
	DspTopReleaseItem,
	DspTopTrackItem,
	EntityOverviewResponse,
	EntityTopDspItem,
	EntityTopTerItem,
	RevenueLineChartItem,
	RevenueTimelineResponse,
	TerritoryBarChartItem,
	TrendViewLineChartItem,
} from '../interfaces/analytics.interface';
import { AnalyticsCacheService } from './analytics-cache.service';

export type EntityType =
	| 'release'
	| 'label'
	| 'artist'
	| 'track'
	| 'tenant'
	| 'channel'
	| 'sourceType';

@Injectable()
export class EntityAnalyticsService {
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

	private addRevenueExact(values: Array<string | null | undefined>): string {
		const decimals = values.map((value) => this.revenueExact(value));
		const scale = Math.max(
			0,
			...decimals.map((value) => (value.split('.')[1] || '').length),
		);
		let sum = 0n;

		for (const value of decimals) {
			const negative = value.trim().startsWith('-');
			const unsigned = negative ? value.trim().slice(1) : value.trim();
			const [whole = '0', frac = ''] = unsigned.split('.');
			const units = BigInt(
				`${whole || '0'}${frac.padEnd(scale, '0') || ''}`,
			);
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

	private subtractRevenueExact(
		left?: string | null,
		right?: string | null,
	): string {
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
		importSource?: string,
	): {
		joinSql: string;
		filterSql: string;
		params: Record<string, any>;
	} {
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = { entityId };

		// Track + system tenant without releaseType: filter on s.isrc, no JOIN needed
		if (entityType === 'track' && isSystem && !releaseType) {
			let filterSql = 'AND s.isrc = {entityId:String}';
			if (importSource) {
				filterSql += ' AND s.import_source = {importSource:String}';
				params.importSource = importSource;
			}
			return { joinSql: '', filterSql, params };
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
			case 'sourceType':
				filterSql += ' AND s.import_source = {entityId:String}';
				break;
		}

		if (releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = releaseType;
		}

		if (importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = importSource;
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
					.filter(
						(territory): territory is string =>
							!!territory && territory !== 'OTHER',
					),
			),
		);

		if (!iso2Codes.length) return items;

		const countries = await this.entityManager.query(
			`
        SELECT UPPER(iso2) AS iso2, name
        FROM countries
        WHERE UPPER(iso2) = ANY($1)
      `,
			[iso2Codes],
		);
		const countryNameByIso2 = new Map(
			countries.map((country: { iso2: string; name: string }) => [country.iso2, country.name]),
		);

		return items.map((item) => {
			const iso2 = item.territory?.trim().toUpperCase();
			const isOther = !iso2 || iso2 === 'OTHER';
			const territory = (isOther
				? item.territory
				: (countryNameByIso2.get(iso2) ?? item.territory)) as string;
			return {
				...item,
				territory,
				isoCode: isOther ? undefined : iso2,
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
		const key = this.cache.buildKey('ent:overview', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeOverview(entityType, entityId, dto, tenantId),
		);
	}

	private async computeOverview(
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
			dto.importSource,
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
				relations: [
					'artistProfiles',
					'artistProfiles.dsp',
					'country',
					'genre',
				],
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
					country:
						artist.country?.name ?? artist.originCountry ?? null,
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
			totalRevenueUsd: this.revenueNumber(
				salesRows[0]?.total_revenue_usd,
			),
			totalRevenueUsdExact: this.revenueExact(
				salesRows[0]?.total_revenue_usd,
			),
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
		const key = this.cache.buildKey('ent:trend-dsp-tl', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeTrendViewDspTimeline(
				entityType,
				entityId,
				dto,
				tenantId,
			),
		);
	}

	private async computeTrendViewDspTimeline(
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
			dto.importSource,
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
		const key = this.cache.buildKey('ent:sales-dsp-tl', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeSalesViewDspTimeline(
				entityType,
				entityId,
				dto,
				tenantId,
			),
		);
	}

	private async computeSalesViewDspTimeline(
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
			dto.importSource,
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
		const key = this.cache.buildKey('ent:trend-dsp-daily-tl', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeTrendViewDspDailyTimeline(
				entityType,
				entityId,
				dto,
				tenantId,
			),
		);
	}

	private async computeTrendViewDspDailyTimeline(
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
			dto.importSource,
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
		const key = this.cache.buildKey('ent:rev-tl', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeRevenueTimeline(entityType, entityId, dto, tenantId),
		);
	}

	private async computeRevenueTimeline(
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
			dto.importSource,
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
				series: {
					dsp: string;
					revenueUsd: number;
					revenueUsdExact: string;
					quantity: number;
				}[];
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
				revenueUsd: this.revenueNumber(
					this.addRevenueExact(val.revenueUsdExactParts),
				),
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
		const key = this.cache.buildKey('ent:trend-line-chart', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeTrendViewLineChart(entityType, entityId, dto, tenantId),
		);
	}

	private async computeTrendViewLineChart(
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
			dto.importSource,
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
		const key = this.cache.buildKey('ent:rev-line-chart', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeRevenueLineChart(entityType, entityId, dto, tenantId),
		);
	}

	private async computeRevenueLineChart(
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
			dto.importSource,
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
		const key = this.cache.buildKey('ent:trend-dsp-bar', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeTrendViewDspBarChart(
				entityType,
				entityId,
				dto,
				tenantId,
			),
		);
	}

	private async computeTrendViewDspBarChart(
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
			dto.importSource,
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
		const totalRows = await this.clickHouseService.query<{
			total_views: string;
		}>(totalSql, params);
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
		const top5Total = items.reduce(
			(acc, item) => acc + (item.totalViews ?? 0),
			0,
		);
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
		const key = this.cache.buildKey('ent:trend-ter-bar', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeTrendViewTerritoryBarChart(
				entityType,
				entityId,
				dto,
				tenantId,
			),
		);
	}

	private async computeTrendViewTerritoryBarChart(
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
			dto.importSource,
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
		const totalRows = await this.clickHouseService.query<{
			total_views: string;
		}>(totalSql, params);
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
		const top5Total = items.reduce(
			(acc, item) => acc + (item.totalViews ?? 0),
			0,
		);
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
		const key = this.cache.buildKey('ent:rev-dsp-bar', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeRevenueDspBarChart(entityType, entityId, dto, tenantId),
		);
	}

	private async computeRevenueDspBarChart(
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
			dto.importSource,
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
		const totalRows = await this.clickHouseService.query<{
			total_rev: string;
		}>(totalSql, params);
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
		const key = this.cache.buildKey('ent:rev-ter-bar', tenantId, {
			entityType,
			entityId,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeRevenueTerritoryBarChart(
				entityType,
				entityId,
				dto,
				tenantId,
			),
		);
	}

	private async computeRevenueTerritoryBarChart(
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
			dto.importSource,
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
		const totalRows = await this.clickHouseService.query<{
			total_rev: string;
		}>(totalSql, params);
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

	// ─────────────────────────────────────────────────────
	// TOP RELEASES (channel entity)
	// ─────────────────────────────────────────────────────

	async getTopReleases(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopReleaseItem>> {
		const key = this.cache.buildKey(
			`ent:top-releases:${entityType}`,
			tenantId,
			{ entityId, ...dto },
		);
		return this.cache.wrap(key, () =>
			this.computeTopReleases(entityType, entityId, dto, tenantId),
		);
	}

	private async computeTopReleases(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopReleaseItem>> {
		const page = dto.page ?? 1;
		const limit = dto.limit;
		const skip = dto.skip;
		const sortCol =
			dto.sortBy === 'revenue' ? 'total_revenue_usd' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);

		const isSystem = checkIsSystemTenant(tenantId);
		const baseParams: Record<string, any> = {
			entityId,
			from: dto.fromDate,
			to: dto.toDate,
			fromMonth,
			toMonth,
		};
		if (!isSystem && entityType !== 'tenant')
			baseParams.tenantId = tenantId;
		const effectiveImportSource =
			entityType === 'sourceType' ? entityId : dto.importSource;
		if (effectiveImportSource)
			baseParams.importSource = effectiveImportSource;
		const importFilter = effectiveImportSource
			? 'AND s.import_source = {importSource:String}'
			: '';
		const tenantFilter =
			isSystem || entityType === 'tenant'
				? ''
				: 'AND t.tenant_id = {tenantId:String}';
		const releaseTypeFilter = dto.releaseType
			? 'AND t.release_type = {releaseType:String}'
			: '';
		if (dto.releaseType) baseParams.releaseType = dto.releaseType;

		const entityFilter =
			(
				{
					channel: 'AND t.channel_id = {entityId:String}',
					release: 'AND t.release_id = {entityId:String}',
					artist: 'AND has(t.artist_ids, {entityId:String})',
					label: 'AND t.label_id = {entityId:String}',
					tenant: 'AND t.tenant_id = {entityId:String}',
					sourceType: '',
				} as Record<string, string>
			)[entityType] ?? 'AND t.release_id = {entityId:String}';

		const whereConditions = `1 = 1 ${tenantFilter} ${entityFilter} ${releaseTypeFilter}`;

		const countSql = `
			SELECT uniq(t.release_id) AS total
			FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
			LEFT JOIN (
				SELECT isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE} s
				WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
				GROUP BY isrc
			) tr ON t.isrc = tr.isrc
			LEFT JOIN (
				SELECT isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
				GROUP BY isrc
			) sa ON t.isrc = sa.isrc
			WHERE ${whereConditions}
				AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
				AND t.release_id != ''
		`;

		const dataSql = `
			SELECT
				t.release_id AS release_id,
				any(t.release_title) AS release_title,
				any(t.release_upc) AS release_upc,
				any(t.label_id) AS label_id,
				any(t.label_name) AS label_name,
				any(t.cover_75) AS cover_75,
				any(t.cover_100) AS cover_100,
				any(t.cover_160) AS cover_160,
				any(t.cover_300) AS cover_300,
				any(t.cover_original) AS cover_original,
				uniq(t.isrc) AS track_count,
				sum(coalesce(tr.total_views, 0)) AS total_views,
				toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
			FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
			LEFT JOIN (
				SELECT isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE} s
				WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
				GROUP BY isrc
			) tr ON t.isrc = tr.isrc
			LEFT JOIN (
				SELECT isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
				GROUP BY isrc
			) sa ON t.isrc = sa.isrc
			WHERE ${whereConditions}
				AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
				AND t.release_id != ''
			GROUP BY t.release_id
			ORDER BY ${sortCol} DESC
			LIMIT ${limit} OFFSET ${skip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(
				countSql,
				baseParams,
			),
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
			}>(dataSql, baseParams),
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

		return new PageDto({
			items,
			metadata: { page, pageSize: limit, totalItems },
		});
	}

	// ─────────────────────────────────────────────────────
	// TOP TRACKS (artist / label / tenant / channel)
	// ─────────────────────────────────────────────────────

	async getTopTracks(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopTrackItem>> {
		const key = this.cache.buildKey(
			`ent:top-tracks:${entityType}`,
			tenantId,
			{ entityId, ...dto },
		);
		return this.cache.wrap(key, () =>
			this.computeTopTracks(entityType, entityId, dto, tenantId),
		);
	}

	private async computeTopTracks(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopTrackItem>> {
		const page = dto.page ?? 1;
		const limit = dto.limit;
		const skip = dto.skip;
		const sortCol =
			dto.sortBy === 'revenue' ? 'total_revenue_usd' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);

		const isSystem = checkIsSystemTenant(tenantId);
		const baseParams: Record<string, any> = {
			entityId,
			from: dto.fromDate,
			to: dto.toDate,
			fromMonth,
			toMonth,
		};
		if (!isSystem && entityType !== 'tenant')
			baseParams.tenantId = tenantId;
		const effectiveImportSource =
			entityType === 'sourceType' ? entityId : dto.importSource;
		if (effectiveImportSource)
			baseParams.importSource = effectiveImportSource;
		const importFilter = effectiveImportSource
			? 'AND s.import_source = {importSource:String}'
			: '';
		const tenantFilter =
			isSystem || entityType === 'tenant'
				? ''
				: 'AND t.tenant_id = {tenantId:String}';
		const releaseTypeFilter = dto.releaseType
			? 'AND t.release_type = {releaseType:String}'
			: '';
		if (dto.releaseType) baseParams.releaseType = dto.releaseType;

		const entityFilter =
			(
				{
					channel: 'AND t.channel_id = {entityId:String}',
					release: 'AND t.release_id = {entityId:String}',
					artist: 'AND has(t.artist_ids, {entityId:String})',
					label: 'AND t.label_id = {entityId:String}',
					tenant: 'AND t.tenant_id = {entityId:String}',
					sourceType: '',
				} as Record<string, string>
			)[entityType] ?? 'AND t.isrc = {entityId:String}';

		const whereConditions = `1 = 1 ${tenantFilter} ${entityFilter} ${releaseTypeFilter}`;

		const countSql = `
			SELECT uniq(t.isrc) AS total
			FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
			LEFT JOIN (
				SELECT isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE} s
				WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
				GROUP BY isrc
			) tr ON t.isrc = tr.isrc
			LEFT JOIN (
				SELECT isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
				GROUP BY isrc
			) sa ON t.isrc = sa.isrc
			WHERE ${whereConditions}
				AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
		`;

		const dataSql = `
			SELECT
				t.isrc AS isrc,
				t.track_title AS track_title,
				t.track_version AS track_version,
				t.release_id AS release_id,
				t.release_title AS release_title,
				arrayStringConcat(t.artist_names, ', ') AS artist_name,
				t.cover_75 AS cover_75,
				t.cover_100 AS cover_100,
				t.cover_160 AS cover_160,
				t.cover_300 AS cover_300,
				t.cover_original AS cover_original,
				coalesce(tr.total_views, 0) AS total_views,
				toString(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd
			FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
			LEFT JOIN (
				SELECT isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE} s
				WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
				GROUP BY isrc
			) tr ON t.isrc = tr.isrc
			LEFT JOIN (
				SELECT isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
				GROUP BY isrc
			) sa ON t.isrc = sa.isrc
			WHERE ${whereConditions}
				AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
			ORDER BY ${sortCol} DESC
			LIMIT ${limit} OFFSET ${skip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(
				countSql,
				baseParams,
			),
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
			}>(dataSql, baseParams),
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

		return new PageDto({
			items,
			metadata: { page, pageSize: limit, totalItems },
		});
	}

	// ─────────────────────────────────────────────────────
	// TOP DSPs (all entity types)
	// ─────────────────────────────────────────────────────

	async getTopDsps(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<EntityTopDspItem>> {
		const key = this.cache.buildKey(
			`ent:top-dsps:${entityType}`,
			tenantId,
			{ entityId, ...dto },
		);
		return this.cache.wrap(key, () =>
			this.computeTopDsps(entityType, entityId, dto, tenantId),
		);
	}

	private async computeTopDsps(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<EntityTopDspItem>> {
		const page = dto.page ?? 1;
		const sortByRevenue = dto.sortBy === 'revenue';
		const sortCol = sortByRevenue ? 'total_revenue_usd_raw' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);

		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = { entityId, fromMonth, toMonth };
		if (!isSystem && entityType !== 'tenant') params.tenantId = tenantId;
		const effectiveImportSource = entityType === 'sourceType' ? entityId : dto.importSource;
		if (effectiveImportSource) params.importSource = effectiveImportSource;
		if (dto.releaseType) params.releaseType = dto.releaseType;

		const importFilter = effectiveImportSource ? 'AND s.import_source = {importSource:String}' : '';
		const tenantFilter = isSystem || entityType === 'tenant' ? '' : 'AND t.tenant_id = {tenantId:String}';
		const releaseTypeFilter = dto.releaseType ? 'AND t.release_type = {releaseType:String}' : '';
		const entityFilter = ({
			release: 'AND t.release_id = {entityId:String}',
			track: 'AND t.isrc = {entityId:String}',
			label: 'AND t.label_id = {entityId:String}',
			artist: 'AND has(t.artist_ids, {entityId:String})',
			tenant: 'AND t.tenant_id = {entityId:String}',
			channel: 'AND t.channel_id = {entityId:String}',
			sourceType: '',
		} as Record<string, string>)[entityType] ?? '';

		const trackJoin = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t ON s.isrc = t.isrc`;
		const whereTrack = `${tenantFilter} ${entityFilter} ${releaseTypeFilter}`;

		const primaryTable = sortByRevenue
			? CLICKHOUSE_TABLES.SALES_DSP_MONTHLY
			: CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY;
		const importFilterSal = effectiveImportSource ? 'AND sal.import_source = {importSource:String}' : '';

		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;

		const countSql = `
			SELECT uniq(s.dsp_id) AS total
			FROM music_analytics.${primaryTable} s
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${importFilter} ${whereTrack}
		`;

		const dataSql = sortByRevenue ? `
			SELECT
				s.dsp_id AS dsp_id,
				${this.resolvedDspName} AS dsp_name,
				sum(s.total_revenue_usd) AS total_revenue_usd_raw,
				toString(sum(s.total_revenue_usd)) AS total_revenue_usd,
				coalesce(sum(tr.total_views), 0) AS total_views
			FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
			${this.dspNameJoin}
			${trackJoin}
			LEFT JOIN (
				SELECT dsp_id, isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} tr_sub
				WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
					${importFilterSal}
				GROUP BY dsp_id, isrc
			) tr ON s.dsp_id = tr.dsp_id AND s.isrc = tr.isrc
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${importFilter} ${whereTrack}
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
			FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
			${this.dspNameJoin}
			${trackJoin}
			LEFT JOIN (
				SELECT dsp_id, isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} sal
				WHERE sal.period >= toDate({fromMonth:String}) AND sal.period <= toDate({toMonth:String})
					${importFilterSal}
				GROUP BY dsp_id, isrc
			) sa ON s.dsp_id = sa.dsp_id AND s.isrc = sa.isrc
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${importFilter} ${whereTrack}
			GROUP BY s.dsp_id, dsp_name
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				dsp_id: string;
				dsp_name: string;
				total_views: string;
				total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);

		if (useTopN && dto.includeOther && dataRows.length > 0) {
			// Fetch grand totals to compute "Other"
			const totalsSql = sortByRevenue ? `
				SELECT toString(sum(s.total_revenue_usd)) AS total_revenue_usd, sum(tr.total_views) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
				${trackJoin}
				LEFT JOIN (
					SELECT dsp_id, isrc, sum(total_quantity) AS total_views
					FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} tr_sub
					WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
						${importFilterSal}
					GROUP BY dsp_id, isrc
				) tr ON s.dsp_id = tr.dsp_id AND s.isrc = tr.isrc
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${importFilter} ${whereTrack}
			` : `
				SELECT sum(s.total_quantity) AS total_views, toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
				${trackJoin}
				LEFT JOIN (
					SELECT dsp_id, isrc, sum(total_revenue_usd) AS total_revenue_usd
					FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} sal
					WHERE sal.period >= toDate({fromMonth:String}) AND sal.period <= toDate({toMonth:String})
						${importFilterSal}
					GROUP BY dsp_id, isrc
				) sa ON s.dsp_id = sa.dsp_id AND s.isrc = sa.isrc
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${importFilter} ${whereTrack}
			`;
			const totalsRow = (await this.clickHouseService.query<{ total_views: string; total_revenue_usd: string }>(totalsSql, params))[0];
			const grandTotalViews = Number(totalsRow?.total_views ?? 0);
			const grandTotalRevExact = this.revenueExact(totalsRow?.total_revenue_usd);
			const topRevExact = this.addRevenueExact(dataRows.map((r) => r.total_revenue_usd));
			const topViews = dataRows.reduce((s, r) => s + Number(r.total_views), 0);
			const otherRevExact = this.subtractRevenueExact(grandTotalRevExact, topRevExact);
			const otherViews = grandTotalViews - topViews;

			const items: EntityTopDspItem[] = dataRows.map((row, i) => ({
				rank: i + 1,
				dspId: row.dsp_id,
				dspName: row.dsp_name || row.dsp_id,
				totalViews: Number(row.total_views),
				totalRevenueUsd: row.total_revenue_usd || '0',
			}));
			if (this.revenueNumber(otherRevExact) > 0 || otherViews > 0) {
				items.push({
					rank: items.length + 1,
					dspId: 'other',
					dspName: 'Other',
					totalViews: Math.max(0, otherViews),
					totalRevenueUsd: otherRevExact,
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

	// ─────────────────────────────────────────────────────
	// TOP TERRITORIES (all entity types)
	// ─────────────────────────────────────────────────────

	async getTopTerritories(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<EntityTopTerItem>> {
		const key = this.cache.buildKey(
			`ent:top-ters:${entityType}`,
			tenantId,
			{ entityId, ...dto },
		);
		return this.cache.wrap(key, () =>
			this.computeTopTerritories(entityType, entityId, dto, tenantId),
		);
	}

	private async computeTopTerritories(
		entityType: EntityType,
		entityId: string,
		dto: EntityRankingQueryDto,
		tenantId: string,
	): Promise<PageDto<EntityTopTerItem>> {
		const page = dto.page ?? 1;
		const sortByRevenue = dto.sortBy === 'revenue';
		const sortCol = sortByRevenue ? 'total_revenue_usd_raw' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);

		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = { entityId, fromMonth, toMonth };
		if (!isSystem && entityType !== 'tenant') params.tenantId = tenantId;
		const effectiveImportSource = entityType === 'sourceType' ? entityId : dto.importSource;
		if (effectiveImportSource) params.importSource = effectiveImportSource;
		if (dto.releaseType) params.releaseType = dto.releaseType;

		const importFilter = effectiveImportSource ? 'AND s.import_source = {importSource:String}' : '';
		const tenantFilter = isSystem || entityType === 'tenant' ? '' : 'AND t.tenant_id = {tenantId:String}';
		const releaseTypeFilter = dto.releaseType ? 'AND t.release_type = {releaseType:String}' : '';
		const entityFilter = ({
			release: 'AND t.release_id = {entityId:String}',
			track: 'AND t.isrc = {entityId:String}',
			label: 'AND t.label_id = {entityId:String}',
			artist: 'AND has(t.artist_ids, {entityId:String})',
			tenant: 'AND t.tenant_id = {entityId:String}',
			channel: 'AND t.channel_id = {entityId:String}',
			sourceType: '',
		} as Record<string, string>)[entityType] ?? '';

		const trackJoin = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t ON s.isrc = t.isrc`;
		const whereTrack = `${tenantFilter} ${entityFilter} ${releaseTypeFilter}`;

		const primaryTable = sortByRevenue
			? CLICKHOUSE_TABLES.SALES_TER_MONTHLY
			: CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY;
		const importFilterSal = effectiveImportSource ? 'AND sal.import_source = {importSource:String}' : '';

		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;

		const countSql = `
			SELECT uniq(s.territory_code) AS total
			FROM music_analytics.${primaryTable} s
			${trackJoin}
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${importFilter} ${whereTrack}
		`;

		const dataSql = sortByRevenue ? `
			SELECT
				s.territory_code AS iso_code,
				sum(s.total_revenue_usd) AS total_revenue_usd_raw,
				toString(sum(s.total_revenue_usd)) AS total_revenue_usd,
				coalesce(sum(tr.total_views), 0) AS total_views
			FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
			${trackJoin}
			LEFT JOIN (
				SELECT territory_code, isrc, sum(total_quantity) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} tr_sub
				WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
					${importFilterSal}
				GROUP BY territory_code, isrc
			) tr ON s.territory_code = tr.territory_code AND s.isrc = tr.isrc
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${importFilter} ${whereTrack}
			GROUP BY s.territory_code
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		` : `
			SELECT
				s.territory_code AS iso_code,
				sum(s.total_quantity) AS total_views,
				sum(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd_raw,
				toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
			FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
			${trackJoin}
			LEFT JOIN (
				SELECT territory_code, isrc, sum(total_revenue_usd) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} sal
				WHERE sal.period >= toDate({fromMonth:String}) AND sal.period <= toDate({toMonth:String})
					${importFilterSal}
				GROUP BY territory_code, isrc
			) sa ON s.territory_code = sa.territory_code AND s.isrc = sa.isrc
			WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
				${importFilter} ${whereTrack}
			GROUP BY s.territory_code
			ORDER BY ${sortCol} DESC
			LIMIT ${topNLimit} OFFSET ${topNSkip}
		`;

		const [countRows, dataRows] = await Promise.all([
			this.clickHouseService.query<{ total: string }>(countSql, params),
			this.clickHouseService.query<{
				iso_code: string;
				total_views: string;
				total_revenue_usd: string;
			}>(dataSql, params),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);
		const iso2Codes = dataRows.map((r) => r.iso_code?.trim().toUpperCase()).filter(Boolean);
		let nameMap = new Map<string, string>();
		if (iso2Codes.length) {
			const countries = await this.entityManager.query(
				`SELECT UPPER(iso2) AS iso2, name FROM countries WHERE UPPER(iso2) = ANY($1)`,
				[iso2Codes],
			);
			nameMap = new Map(countries.map((c: { iso2: string; name: string }) => [c.iso2, c.name]));
		}

		if (useTopN && dto.includeOther && dataRows.length > 0) {
			const totalsSql = sortByRevenue ? `
				SELECT toString(sum(s.total_revenue_usd)) AS total_revenue_usd, sum(tr.total_views) AS total_views
				FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
				${trackJoin}
				LEFT JOIN (
					SELECT territory_code, isrc, sum(total_quantity) AS total_views
					FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} tr_sub
					WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
						${importFilterSal}
					GROUP BY territory_code, isrc
				) tr ON s.territory_code = tr.territory_code AND s.isrc = tr.isrc
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${importFilter} ${whereTrack}
			` : `
				SELECT sum(s.total_quantity) AS total_views, toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
				${trackJoin}
				LEFT JOIN (
					SELECT territory_code, isrc, sum(total_revenue_usd) AS total_revenue_usd
					FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} sal
					WHERE sal.period >= toDate({fromMonth:String}) AND sal.period <= toDate({toMonth:String})
						${importFilterSal}
					GROUP BY territory_code, isrc
				) sa ON s.territory_code = sa.territory_code AND s.isrc = sa.isrc
				WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
					${importFilter} ${whereTrack}
			`;
			const totalsRow = (await this.clickHouseService.query<{ total_views: string; total_revenue_usd: string }>(totalsSql, params))[0];
			const grandTotalViews = Number(totalsRow?.total_views ?? 0);
			const grandTotalRevExact = this.revenueExact(totalsRow?.total_revenue_usd);
			const topRevExact = this.addRevenueExact(dataRows.map((r) => r.total_revenue_usd));
			const topViews = dataRows.reduce((s, r) => s + Number(r.total_views), 0);
			const otherRevExact = this.subtractRevenueExact(grandTotalRevExact, topRevExact);
			const otherViews = grandTotalViews - topViews;

			const items: EntityTopTerItem[] = dataRows.map((row, i) => {
				const isoCode = row.iso_code?.trim().toUpperCase() || '';
				return {
					rank: i + 1,
					isoCode,
					territory: nameMap.get(isoCode) ?? isoCode,
					totalViews: Number(row.total_views),
					totalRevenueUsd: row.total_revenue_usd || '0',
				};
			});
			if (this.revenueNumber(otherRevExact) > 0 || otherViews > 0) {
				items.push({
					rank: items.length + 1,
					isoCode: '',
					territory: 'Other',
					totalViews: Math.max(0, otherViews),
					totalRevenueUsd: otherRevExact,
				});
			}
			return new PageDto({ items, metadata: { page, pageSize: topNLimit, totalItems } });
		}

		const rankOffset = useTopN ? 0 : dto.skip;
		const items: EntityTopTerItem[] = dataRows.map((row, i) => {
			const isoCode = row.iso_code?.trim().toUpperCase() || '';
			return {
				rank: rankOffset + i + 1,
				isoCode,
				territory: nameMap.get(isoCode) ?? isoCode,
				totalViews: Number(row.total_views),
				totalRevenueUsd: row.total_revenue_usd || '0',
			};
		});

		return new PageDto({ items, metadata: { page, pageSize: useTopN ? topNLimit : dto.limit, totalItems } });
	}
}
