import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { toCountryFlagImageUrl } from 'src/utils/country-flag-image-url.util';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { EntityManager } from 'typeorm';
import {
	DspAnalyticsSummaryQueryDto,
	DspChartQueryDto,
	DspOverviewQueryDto,
	DspRevenueChartQueryDto,
	DspTopQueryDto,
} from '../dto/analytics-query.dto';
import {
	AnalyticsSummaryResponse,
	DspMeta,
	DspOverviewResponse,
	DspTopReleaseItem,
	DspTopTrackItem,
	EntityTopTerItem,
	RevenueLineChartItem,
	TerritoryBarChartItem,
	TrendViewLineChartItem,
} from '../interfaces/analytics.interface';
import { toDspImageUrl } from '../utils/dsp-image-url.util';
import { AnalyticsCacheService } from './analytics-cache.service';
import {
	appendAnalyticsVideoScopeFilter,
	getAnalyticsVideoScope,
} from './analytics-video-scope.service';

/**
 * DspAnalyticsService — thống kê chi tiết cho 1 DSP cụ thể.
 * Mirror pattern của EntityAnalyticsService nhưng với entity = DSP.
 *
 * Filter chiến lược:
 *  - Nhận pgDspId (Postgres UUID) và/hoặc dspReportId (raw ClickHouse ID)
 *  - Nếu có pgDspId → resolve qua dsps_report.pg_uuid để lấy TẤT CẢ raw dsp_id đã map
 *  - Nếu có dspReportId → filter thẳng s.dsp_id
 *  - Có cả 2 → OR (bảo đảm cover hết data, kể cả những raw ID chưa được map vào Postgres)
 */
@Injectable()
export class DspAnalyticsService {
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
			...decimals.map((v) => (v.split('.')[1] || '').length),
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
	// Helper: build JOIN + WHERE scoped theo DSP + tenant
	// ─────────────────────────────────────────────────────
	private buildDspFilters(
		tenantId: string,
		pgDspId?: string,
		dspReportId?: string,
		releaseType?: 'audio' | 'video',
		opts?: {
			tableHasDspId?: boolean;
			importSource?: string;
			analyticsVideoScope?: ReturnType<typeof getAnalyticsVideoScope>;
		},
	): {
		joinSql: string;
		filterSql: string;
		params: Record<string, any>;
	} {
		if (!pgDspId && !dspReportId) {
			throw new BadRequestException(
				'Cần cung cấp ít nhất pgDspId hoặc dspReportId',
			);
		}

		const isSystem = checkIsSystemTenant(tenantId);
		// Territory-level cubes (trends_ter, sales_ter) không có cột dsp_id — filter DSP
		// phải đi qua isrc JOIN pg_tracks_sync → dsps_report thay vì s.dsp_id trực tiếp.
		const tableHasDspId = opts?.tableHasDspId !== false;
		const params: Record<string, any> = {};
		const importSourceFilter = opts?.importSource
			? ' AND s.import_source = {importSource:String}'
			: '';
		if (opts?.importSource) params.importSource = opts.importSource;

		let dspFilter: string;
		if (tableHasDspId) {
			// DSP-level cube: filter trực tiếp qua s.dsp_id
			const dspClauses: string[] = [];
			if (pgDspId) {
				dspClauses.push(
					`s.dsp_id IN (SELECT id_dsps_report FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE pg_uuid = {pgDspId:String})`,
				);
				params.pgDspId = pgDspId;
			}
			if (dspReportId) {
				dspClauses.push(`s.dsp_id = {dspReportId:String}`);
				params.dspReportId = dspReportId;
			}
			dspFilter = ` AND (${dspClauses.join(' OR ')})`;
		} else {
			// Territory-level cube: không có dsp_id — filter qua isrc thuộc DSP
			// (join pg_tracks_sync bên dưới cung cấp alias t, dùng t.isrc để scope)
			const dspIsrcClauses: string[] = [];
			if (pgDspId) {
				dspIsrcClauses.push(
					`t.isrc IN (SELECT pts.isrc FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} pts FINAL INNER JOIN music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} dr FINAL ON pts.tenant_id = dr.pg_uuid WHERE dr.pg_uuid = {pgDspId:String} AND pts.is_deleted = 0)`,
				);
				params.pgDspId = pgDspId;
			}
			if (dspReportId) {
				dspIsrcClauses.push(
					`t.isrc IN (SELECT pts.isrc FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} pts FINAL INNER JOIN music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} dr FINAL ON dr.id_dsps_report = {dspReportId:String} WHERE pts.is_deleted = 0)`,
				);
				params.dspReportId = dspReportId;
			}
			dspFilter = dspIsrcClauses.length
				? ` AND (${dspIsrcClauses.join(' OR ')})`
				: '';
		}

		// System tenant + no releaseType: skip pg_tracks_sync join
		if (
			isSystem &&
			!releaseType &&
			tableHasDspId &&
			opts?.analyticsVideoScope?.allowedChannelIds === undefined
		) {
			return {
				joinSql: '',
				filterSql: `${dspFilter}${importSourceFilter}`,
				params,
			};
		}

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
		let filterSql = ' AND t.is_deleted = 0';
		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = releaseType;
		}
		filterSql = appendAnalyticsVideoScopeFilter(
			filterSql,
			params,
			opts?.analyticsVideoScope,
		);
		filterSql += `${dspFilter}${importSourceFilter}`;

		return { joinSql, filterSql, params };
	}

	// Map iso2 codes → country names (dùng cho territory bar chart)
	async getSummary(
		dto: DspAnalyticsSummaryQueryDto,
		tenantId: string,
	): Promise<AnalyticsSummaryResponse> {
		if (dto.fromDate > dto.toDate) {
			throw new BadRequestException(
				'fromDate must be before or equal to toDate',
			);
		}

		const key = this.cache.buildKey('dsp:summary', tenantId, dto);
		return this.cache.wrap(key, () => this.computeSummary(dto, tenantId));
	}

	private async computeSummary(
		dto: DspAnalyticsSummaryQueryDto,
		tenantId: string,
	): Promise<AnalyticsSummaryResponse> {
		const { joinSql, filterSql, params } = this.buildDspFilters(
			tenantId,
			dto.pgDspId,
			dto.dspReportId,
			dto.releaseType,
			{
				importSource: dto.importSource,
				analyticsVideoScope: getAnalyticsVideoScope(dto),
			},
		);
		const trendParams = { ...params, from: dto.fromDate, to: dto.toDate };
		const salesParams = {
			...params,
			from: normalizeDateToFirstOfMonth(dto.fromDate),
			to: normalizeDateToFirstOfMonth(dto.toDate),
		};

		const trendSql = `
      SELECT sum(s.total_quantity) AS total_trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String})
        AND s.reporting_date <= toDate({to:String})
        ${filterSql}
    `;
		const salesSql = `
      SELECT
        sum(s.total_quantity) AS total_usage,
        sum(s.total_revenue_usd) AS total_revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
    `;

		const [trendRows, salesRows] = await Promise.all([
			this.clickHouseService.query<{ total_trend_views: string }>(
				trendSql,
				trendParams,
			),
			this.clickHouseService.query<{
				total_usage: string;
				total_revenue_usd: string;
			}>(salesSql, salesParams),
		]);

		return {
			totalTrendViews: Number(trendRows[0]?.total_trend_views ?? 0),
			totalUsage: Number(salesRows[0]?.total_usage ?? 0),
			totalRevenueUsd: this.revenueNumber(
				salesRows[0]?.total_revenue_usd,
			),
			totalRevenueUsdExact: this.revenueExact(
				salesRows[0]?.total_revenue_usd,
			),
		};
	}

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
		if (!iso2Codes.length) {
			return items.map((item) => ({ ...item, imageUrl: null }));
		}
		const countries = await this.entityManager.query(
			`SELECT UPPER(iso2) AS iso2, name, flag_image_key FROM countries WHERE UPPER(iso2) = ANY($1)`,
			[iso2Codes],
		);
		const countryByIso2 = new Map<
			string,
			{ name: string; imageUrl: string | null }
		>(
			countries.map(
				(c: {
					iso2: string;
					name: string;
					flag_image_key: string | null;
				}) => [
					c.iso2,
					{
						name: c.name,
						imageUrl: toCountryFlagImageUrl(c.flag_image_key),
					},
				],
			),
		);
		return items.map((item) => {
			const iso2 = item.territory?.trim().toUpperCase();
			const isOther = !iso2 || iso2 === 'OTHER';
			const country = iso2 ? countryByIso2.get(iso2) : undefined;
			const territory = isOther
				? item.territory
				: (country?.name ?? item.territory);
			return {
				...item,
				territory,
				isoCode: isOther ? undefined : iso2,
				imageUrl: isOther ? null : (country?.imageUrl ?? null),
			};
		});
	}

	// Lookup DSP metadata từ Postgres nếu có pgDspId
	private async loadDspMeta(
		pgDspId?: string,
		dspReportId?: string,
	): Promise<DspMeta | null> {
		if (pgDspId) {
			const dsp = await this.entityManager.findOne(Dsp, {
				where: { id: pgDspId },
				select: ['id', 'name', 'code', 'picture', 'isActive', 'type'],
			});
			if (dsp) {
				const pictureUrl = toDspImageUrl(dsp.picture);
				return {
					pgDspId: dsp.id,
					dspReportId: dspReportId ?? null,
					name: dsp.name,
					code: dsp.code ?? null,
					picture: pictureUrl,
					imageUrl: pictureUrl,
					isActive: dsp.isActive,
					type: dsp.type ?? null,
				};
			}
		}

		// Fallback: lookup name từ dsps_report ClickHouse
		if (dspReportId) {
			const rows = await this.clickHouseService.query<{
				dsp_name: string;
				pg_uuid: string;
				picture: string | null;
			}>(
				`SELECT r.dsp_name, r.pg_uuid, p.picture
				 FROM (SELECT id_dsps_report, dsp_name, pg_uuid FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL) r
				 LEFT JOIN (SELECT pg_uuid, picture FROM music_analytics.${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
				 WHERE r.id_dsps_report = {dspReportId:String}
				 LIMIT 1`,
				{ dspReportId },
			);
			if (rows.length) {
				return {
					pgDspId: rows[0].pg_uuid || null,
					dspReportId,
					name: rows[0].dsp_name || dspReportId,
					code: null,
					picture: toDspImageUrl(rows[0].picture),
					imageUrl: toDspImageUrl(rows[0].picture),
					isActive: null,
					type: null,
				};
			}
		}

		return null;
	}

	// ─────────────────────────────────────────────────────
	// OVERVIEW (tổng trend views + sales views + revenue + meta)
	// ─────────────────────────────────────────────────────
	async getOverview(
		dto: DspOverviewQueryDto,
		tenantId: string,
	): Promise<DspOverviewResponse> {
		const key = this.cache.buildKey('dsp:overview', tenantId, dto);
		return this.cache.wrap(key, () => this.computeOverview(dto, tenantId));
	}

	private async computeOverview(
		dto: DspOverviewQueryDto,
		tenantId: string,
	): Promise<DspOverviewResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildDspFilters(
			tenantId,
			dto.pgDspId,
			dto.dspReportId,
			dto.releaseType,
			{ analyticsVideoScope: getAnalyticsVideoScope(dto) },
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

		const [trendRows, salesRows, dspMeta] = await Promise.all([
			this.clickHouseService.query<{ total_trend_views: string }>(
				trendSql,
				params,
			),
			this.clickHouseService.query<{
				total_sales_views: string;
				total_revenue_usd: string;
			}>(salesSql, params),
			this.loadDspMeta(dto.pgDspId, dto.dspReportId),
		]);

		return {
			totalTrendViews: Number(trendRows[0]?.total_trend_views ?? 0),
			totalSalesViews: Number(salesRows[0]?.total_sales_views ?? 0),
			totalRevenueUsd: this.revenueNumber(
				salesRows[0]?.total_revenue_usd,
			),
			totalRevenueUsdExact: this.revenueExact(
				salesRows[0]?.total_revenue_usd,
			),
			dsp: dspMeta,
		};
	}

	// ─────────────────────────────────────────────────────
	// TREND VIEW LINE CHART (daily)
	// ─────────────────────────────────────────────────────
	async getTrendViewLineChart(
		dto: DspChartQueryDto,
		tenantId: string,
	): Promise<TrendViewLineChartItem[]> {
		const key = this.cache.buildKey('dsp:trend-line-chart', tenantId, dto);
		return this.cache.wrap(key, () =>
			this.computeTrendViewLineChart(dto, tenantId),
		);
	}

	private async computeTrendViewLineChart(
		dto: DspChartQueryDto,
		tenantId: string,
	): Promise<TrendViewLineChartItem[]> {
		const { joinSql, filterSql, params } = this.buildDspFilters(
			tenantId,
			dto.pgDspId,
			dto.dspReportId,
			dto.releaseType,
			{ analyticsVideoScope: getAnalyticsVideoScope(dto) },
		);
		params.from = dto.fromDate;
		params.to = dto.toDate;

		const sql = `
      SELECT
        formatDateTime(s.reporting_date, '%Y-%m-%d') AS period,
        sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${filterSql}
      GROUP BY s.reporting_date, period
      ORDER BY s.reporting_date ASC
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

	// ─────────────────────────────────────────────────────
	// REVENUE LINE CHART (monthly)
	// ─────────────────────────────────────────────────────
	async getRevenueLineChart(
		dto: DspRevenueChartQueryDto,
		tenantId: string,
	): Promise<RevenueLineChartItem[]> {
		const key = this.cache.buildKey('dsp:rev-line-chart', tenantId, dto);
		return this.cache.wrap(key, () =>
			this.computeRevenueLineChart(dto, tenantId),
		);
	}

	private async computeRevenueLineChart(
		dto: DspRevenueChartQueryDto,
		tenantId: string,
	): Promise<RevenueLineChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildDspFilters(
			tenantId,
			dto.pgDspId,
			dto.dspReportId,
			dto.releaseType,
			{ analyticsVideoScope: getAnalyticsVideoScope(dto) },
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

	// ─────────────────────────────────────────────────────
	// TREND VIEW TERRITORY BAR CHART (top 5 + Other)
	// ─────────────────────────────────────────────────────
	async getTrendViewTerritoryBarChart(
		dto: DspChartQueryDto,
		tenantId: string,
	): Promise<TerritoryBarChartItem[]> {
		const key = this.cache.buildKey('dsp:trend-ter-bar', tenantId, dto);
		return this.cache.wrap(key, () =>
			this.computeTrendViewTerritoryBarChart(dto, tenantId),
		);
	}

	private async computeTrendViewTerritoryBarChart(
		dto: DspChartQueryDto,
		tenantId: string,
	): Promise<TerritoryBarChartItem[]> {
		const { joinSql, filterSql, params } = this.buildDspFilters(
			tenantId,
			dto.pgDspId,
			dto.dspReportId,
			dto.releaseType,
			{ analyticsVideoScope: getAnalyticsVideoScope(dto) },
		);
		params.from = dto.fromDate;
		params.to = dto.toDate;

		const totalSql = `
      SELECT sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_DAILY_CUBE} s
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
        s.territory_code AS territory,
        sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_DAILY_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
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
			imageUrl: null,
			totalViews: Number(row.total_views),
		}));
		const top5Total = items.reduce(
			(acc, item) => acc + (item.totalViews ?? 0),
			0,
		);
		const otherViews = grandTotal - top5Total;
		if (otherViews > 0) {
			items.push({
				territory: 'Other',
				imageUrl: null,
				totalViews: otherViews,
			});
		}
		return this.mapTerritoryCodesToCountryNames(items);
	}

	// ─────────────────────────────────────────────────────
	// REVENUE TERRITORY BAR CHART (top 5 + Other)
	// ─────────────────────────────────────────────────────
	async getRevenueTerritoryBarChart(
		dto: DspRevenueChartQueryDto,
		tenantId: string,
	): Promise<TerritoryBarChartItem[]> {
		const key = this.cache.buildKey('dsp:rev-ter-bar', tenantId, dto);
		return this.cache.wrap(key, () =>
			this.computeRevenueTerritoryBarChart(dto, tenantId),
		);
	}

	private async computeRevenueTerritoryBarChart(
		dto: DspRevenueChartQueryDto,
		tenantId: string,
	): Promise<TerritoryBarChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildDspFilters(
			tenantId,
			dto.pgDspId,
			dto.dspReportId,
			dto.releaseType,
			{
				tableHasDspId: false,
				analyticsVideoScope: getAnalyticsVideoScope(dto),
			},
		);
		params.from = fromDate;
		params.to = toDate;
		const orderBy = dto.sortBy === 'usage' ? 'quantity' : 'revenue_usd';

		const totalSql = `
      SELECT
        sum(s.total_revenue_usd) AS total_rev,
        sum(s.total_quantity) AS total_qty
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
		const totalRows = await this.clickHouseService.query<{
			total_rev: string;
			total_qty: string;
		}>(totalSql, params);
		const grandTotalExact = this.revenueExact(totalRows[0]?.total_rev);
		const grandTotalQuantity = Number(totalRows[0]?.total_qty ?? 0);

		const sql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_revenue_usd) AS revenue_usd,
        sum(s.total_quantity) AS quantity
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY territory
      ORDER BY ${orderBy} DESC, territory ASC
      LIMIT 5
    `;
		const rows = await this.clickHouseService.query<{
			territory: string;
			revenue_usd: string;
			quantity: string;
		}>(sql, params);

		const items: TerritoryBarChartItem[] = rows.map((row) => ({
			territory: row.territory,
			imageUrl: null,
			revenueUsd: this.revenueNumber(row.revenue_usd),
			revenueUsdExact: this.revenueExact(row.revenue_usd),
			quantity: Number(row.quantity),
		}));
		const top5TotalExact = this.addRevenueExact(
			items.map((item) => item.revenueUsdExact),
		);
		const otherRevExact = this.subtractRevenueExact(
			grandTotalExact,
			top5TotalExact,
		);
		const otherRev = this.revenueNumber(otherRevExact);
		const topQuantity = items.reduce(
			(sum, item) => sum + (item.quantity ?? 0),
			0,
		);
		const otherQuantity = Math.max(0, grandTotalQuantity - topQuantity);
		if (otherRev > 0 || otherQuantity > 0) {
			items.push({
				territory: 'Other',
				imageUrl: null,
				revenueUsd: otherRev,
				revenueUsdExact: otherRevExact,
				quantity: otherQuantity,
			});
		}
		return this.mapTerritoryCodesToCountryNames(items);
	}

	// ─────────────────────────────────────────────────────
	// TOP TRACKS
	// ─────────────────────────────────────────────────────

	async getTopTracks(
		dto: DspTopQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopTrackItem>> {
		const key = this.cache.buildKey('dsp:top-tracks', tenantId, dto);
		return this.cache.wrap(key, () => this.computeTopTracks(dto, tenantId));
	}

	private async computeTopTracks(
		dto: DspTopQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopTrackItem>> {
		const page = dto.page ?? 1;
		const sortCol =
			dto.sortBy === 'revenue'
				? 'total_revenue_usd_raw'
				: dto.sortBy === 'usage'
					? 'total_usage'
					: 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);

		const dspSubquery = dto.pgDspId
			? `s.dsp_id IN (SELECT id_dsps_report FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE pg_uuid = {pgDspId:String})`
			: `s.dsp_id = {dspReportId:String}`;
		const baseParams: Record<string, any> = {
			from: dto.fromDate,
			to: dto.toDate,
			fromMonth,
			toMonth,
		};
		if (dto.pgDspId) baseParams.pgDspId = dto.pgDspId;
		if (dto.dspReportId) baseParams.dspReportId = dto.dspReportId;
		if (dto.importSource) baseParams.importSource = dto.importSource;
		const importFilter = dto.importSource
			? 'AND s.import_source = {importSource:String}'
			: '';

		const isSystem = checkIsSystemTenant(tenantId);
		const tenantFilter = isSystem
			? ''
			: 'AND t.tenant_id = {tenantId:String}';
		if (!isSystem) baseParams.tenantId = tenantId;
		const releaseTypeFilter = dto.releaseType
			? 'AND t.release_type = {releaseType:String}'
			: '';
		if (dto.releaseType) baseParams.releaseType = dto.releaseType;

		const validUpcFilter =
			"(t.release_type = 'video' OR match(replaceRegexpOne(t.release_upc, '^0+', ''), '^[0-9]{10,14}$'))";

		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;

		const countSql = `
      SELECT uniq(t.isrc) AS total
      FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
      LEFT JOIN (
        SELECT isrc, sum(total_quantity) AS total_views
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
        WHERE ${dspSubquery} AND s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
        GROUP BY isrc
      ) tr ON t.isrc = tr.isrc
      LEFT JOIN (
        SELECT
          isrc,
          sum(total_quantity) AS total_usage,
          sum(total_revenue_usd) AS total_revenue_usd
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
        WHERE ${dspSubquery} AND s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
        GROUP BY isrc
      ) sa ON t.isrc = sa.isrc
      WHERE ${validUpcFilter} ${tenantFilter} ${releaseTypeFilter}
        AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_usage, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
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
        coalesce(sa.total_usage, 0) AS total_usage,
        coalesce(sa.total_revenue_usd, 0) AS total_revenue_usd_raw,
        toString(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd
      FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
      LEFT JOIN (
        SELECT isrc, sum(total_quantity) AS total_views
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
        WHERE ${dspSubquery} AND s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
        GROUP BY isrc
      ) tr ON t.isrc = tr.isrc
      LEFT JOIN (
        SELECT
          isrc,
          sum(total_quantity) AS total_usage,
          sum(total_revenue_usd) AS total_revenue_usd
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
        WHERE ${dspSubquery} AND s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
        GROUP BY isrc
      ) sa ON t.isrc = sa.isrc
      WHERE ${validUpcFilter} ${tenantFilter} ${releaseTypeFilter}
        AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_usage, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
      ORDER BY ${sortCol} DESC
      LIMIT ${topNLimit} OFFSET ${topNSkip}
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
				total_usage: string;
				total_revenue_usd: string;
			}>(dataSql, baseParams),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);

		if (useTopN && dto.includeOther && dataRows.length > 0) {
			const totalsSql = `
				SELECT
          sum(coalesce(tr.total_views, 0)) AS total_views,
          sum(coalesce(sa.total_usage, 0)) AS total_usage,
          toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
        FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
        LEFT JOIN (
          SELECT isrc, sum(total_quantity) AS total_views
          FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
          WHERE ${dspSubquery} AND s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
          GROUP BY isrc
        ) tr ON t.isrc = tr.isrc
        LEFT JOIN (
          SELECT
            isrc,
            sum(total_quantity) AS total_usage,
            sum(total_revenue_usd) AS total_revenue_usd
          FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
          WHERE ${dspSubquery} AND s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
          GROUP BY isrc
        ) sa ON t.isrc = sa.isrc
        WHERE ${validUpcFilter} ${tenantFilter} ${releaseTypeFilter}
          AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_usage, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
      `;
			const totalsRow = (
				await this.clickHouseService.query<{
					total_views: string;
					total_usage: string;
					total_revenue_usd: string;
				}>(totalsSql, baseParams)
			)[0];
			const grandTotalViews = Number(totalsRow?.total_views ?? 0);
			const grandTotalUsage = Number(totalsRow?.total_usage ?? 0);
			const grandTotalRevExact = this.revenueExact(
				totalsRow?.total_revenue_usd,
			);
			const topRevExact = this.addRevenueExact(
				dataRows.map((r) => r.total_revenue_usd),
			);
			const topViews = dataRows.reduce(
				(s, r) => s + Number(r.total_views),
				0,
			);
			const topUsage = dataRows.reduce(
				(s, r) => s + Number(r.total_usage),
				0,
			);
			const otherRevExact = this.subtractRevenueExact(
				grandTotalRevExact,
				topRevExact,
			);
			const otherViews = Math.max(0, grandTotalViews - topViews);
			const otherUsage = Math.max(0, grandTotalUsage - topUsage);

			const items: DspTopTrackItem[] = dataRows.map((row, i) => ({
				rank: i + 1,
				isrc: row.isrc,
				title: row.track_title || '',
				version: row.track_version || null,
				artistName: row.artist_name || '',
				releaseId: row.release_id || '',
				releaseTitle: row.release_title || '',
				totalViews: Number(row.total_views),
				totalUsage: Number(row.total_usage),
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
			if (
				this.revenueNumber(otherRevExact) > 0 ||
				otherViews > 0 ||
				otherUsage > 0
			) {
				items.push({
					rank: items.length + 1,
					isrc: 'other',
					title: 'Other',
					version: null,
					artistName: '',
					releaseId: '',
					releaseTitle: '',
					totalViews: otherViews,
					totalUsage: otherUsage,
					totalRevenueUsd: otherRevExact,
					release: {
						coverArtThumbnails: {
							'75x75': null,
							'100x100': null,
							'160x160': null,
							'300x300': null,
							original: null,
						},
					},
				});
			}
			return new PageDto({
				items,
				metadata: { page, pageSize: topNLimit, totalItems },
			});
		}

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
			totalUsage: Number(row.total_usage),
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

	// ─────────────────────────────────────────────────────
	// TOP RELEASES
	// ─────────────────────────────────────────────────────

	async getTopReleases(
		dto: DspTopQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopReleaseItem>> {
		const key = this.cache.buildKey('dsp:top-releases', tenantId, dto);
		return this.cache.wrap(key, () =>
			this.computeTopReleases(dto, tenantId),
		);
	}

	private async computeTopReleases(
		dto: DspTopQueryDto,
		tenantId: string,
	): Promise<PageDto<DspTopReleaseItem>> {
		const page = dto.page ?? 1;
		const sortCol =
			dto.sortBy === 'revenue'
				? 'total_revenue_usd_raw'
				: dto.sortBy === 'usage'
					? 'total_usage'
					: 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);

		const dspSubquery = dto.pgDspId
			? `s.dsp_id IN (SELECT id_dsps_report FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE pg_uuid = {pgDspId:String})`
			: `s.dsp_id = {dspReportId:String}`;
		const baseParams: Record<string, any> = {
			from: dto.fromDate,
			to: dto.toDate,
			fromMonth,
			toMonth,
		};
		if (dto.pgDspId) baseParams.pgDspId = dto.pgDspId;
		if (dto.dspReportId) baseParams.dspReportId = dto.dspReportId;
		if (dto.importSource) baseParams.importSource = dto.importSource;
		const importFilter = dto.importSource
			? 'AND s.import_source = {importSource:String}'
			: '';

		const isSystem = checkIsSystemTenant(tenantId);
		const tenantFilter = isSystem
			? ''
			: 'AND t.tenant_id = {tenantId:String}';
		if (!isSystem) baseParams.tenantId = tenantId;
		const releaseTypeFilter = dto.releaseType
			? 'AND t.release_type = {releaseType:String}'
			: '';
		if (dto.releaseType) baseParams.releaseType = dto.releaseType;

		const validUpcFilter =
			"(t.release_type = 'video' OR match(replaceRegexpOne(t.release_upc, '^0+', ''), '^[0-9]{10,14}$'))";

		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;

		const countSql = `
      SELECT uniq(t.release_id) AS total
      FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
      LEFT JOIN (
        SELECT isrc, sum(total_quantity) AS total_views
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
        WHERE ${dspSubquery} AND s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
        GROUP BY isrc
      ) tr ON t.isrc = tr.isrc
      LEFT JOIN (
        SELECT
          isrc,
          sum(total_quantity) AS total_usage,
          sum(total_revenue_usd) AS total_revenue_usd
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
        WHERE ${dspSubquery} AND s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
        GROUP BY isrc
      ) sa ON t.isrc = sa.isrc
      WHERE ${validUpcFilter} ${tenantFilter} ${releaseTypeFilter}
        AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_usage, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
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
        sum(coalesce(sa.total_usage, 0)) AS total_usage,
        sum(coalesce(sa.total_revenue_usd, 0)) AS total_revenue_usd_raw,
        toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
      FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
      LEFT JOIN (
        SELECT isrc, sum(total_quantity) AS total_views
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
        WHERE ${dspSubquery} AND s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
        GROUP BY isrc
      ) tr ON t.isrc = tr.isrc
      LEFT JOIN (
        SELECT
          isrc,
          sum(total_quantity) AS total_usage,
          sum(total_revenue_usd) AS total_revenue_usd
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
        WHERE ${dspSubquery} AND s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
        GROUP BY isrc
      ) sa ON t.isrc = sa.isrc
      WHERE ${validUpcFilter} ${tenantFilter} ${releaseTypeFilter}
        AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_usage, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
        AND t.release_id != ''
      GROUP BY t.release_id
      ORDER BY ${sortCol} DESC
      LIMIT ${topNLimit} OFFSET ${topNSkip}
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
				total_usage: string;
				total_revenue_usd: string;
			}>(dataSql, baseParams),
		]);

		const totalItems = Number(countRows[0]?.total ?? 0);

		if (useTopN && dto.includeOther && dataRows.length > 0) {
			const totalsSql = `
				SELECT
          sum(coalesce(tr.total_views, 0)) AS total_views,
          sum(coalesce(sa.total_usage, 0)) AS total_usage,
          toString(sum(coalesce(sa.total_revenue_usd, 0))) AS total_revenue_usd
        FROM (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL WHERE is_deleted = 0) t
        LEFT JOIN (
          SELECT isrc, sum(total_quantity) AS total_views
          FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
          WHERE ${dspSubquery} AND s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String}) ${importFilter}
          GROUP BY isrc
        ) tr ON t.isrc = tr.isrc
        LEFT JOIN (
          SELECT
            isrc,
            sum(total_quantity) AS total_usage,
            sum(total_revenue_usd) AS total_revenue_usd
          FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
          WHERE ${dspSubquery} AND s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String}) ${importFilter}
          GROUP BY isrc
        ) sa ON t.isrc = sa.isrc
        WHERE ${validUpcFilter} ${tenantFilter} ${releaseTypeFilter}
          AND (coalesce(tr.total_views, 0) > 0 OR coalesce(sa.total_usage, 0) > 0 OR coalesce(sa.total_revenue_usd, 0) > 0)
          AND t.release_id != ''
      `;
			const totalsRow = (
				await this.clickHouseService.query<{
					total_views: string;
					total_usage: string;
					total_revenue_usd: string;
				}>(totalsSql, baseParams)
			)[0];
			const grandTotalViews = Number(totalsRow?.total_views ?? 0);
			const grandTotalUsage = Number(totalsRow?.total_usage ?? 0);
			const grandTotalRevExact = this.revenueExact(
				totalsRow?.total_revenue_usd,
			);
			const topRevExact = this.addRevenueExact(
				dataRows.map((r) => r.total_revenue_usd),
			);
			const topViews = dataRows.reduce(
				(s, r) => s + Number(r.total_views),
				0,
			);
			const topUsage = dataRows.reduce(
				(s, r) => s + Number(r.total_usage),
				0,
			);
			const otherRevExact = this.subtractRevenueExact(
				grandTotalRevExact,
				topRevExact,
			);
			const otherViews = Math.max(0, grandTotalViews - topViews);
			const otherUsage = Math.max(0, grandTotalUsage - topUsage);

			const items: DspTopReleaseItem[] = dataRows.map((row, i) => ({
				rank: i + 1,
				releaseId: row.release_id,
				title: row.release_title || '',
				upc: row.release_upc || null,
				labelId: row.label_id || null,
				labelName: row.label_name || null,
				trackCount: Number(row.track_count),
				totalViews: Number(row.total_views),
				totalUsage: Number(row.total_usage),
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
			if (
				this.revenueNumber(otherRevExact) > 0 ||
				otherViews > 0 ||
				otherUsage > 0
			) {
				items.push({
					rank: items.length + 1,
					releaseId: 'other',
					title: 'Other',
					upc: null,
					labelId: null,
					labelName: null,
					trackCount: 0,
					totalViews: otherViews,
					totalUsage: otherUsage,
					totalRevenueUsd: otherRevExact,
					release: {
						coverArtThumbnails: {
							'75x75': null,
							'100x100': null,
							'160x160': null,
							'300x300': null,
							original: null,
						},
					},
				});
			}
			return new PageDto({
				items,
				metadata: { page, pageSize: topNLimit, totalItems },
			});
		}

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
			totalUsage: Number(row.total_usage),
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

	// ─────────────────────────────────────────────────────
	// TOP TERRITORIES
	// ─────────────────────────────────────────────────────

	// async getTopTerritories(
	// 	dto: DspTopQueryDto,
	// 	tenantId: string,
	// ): Promise<PageDto<EntityTopTerItem>> {
	// 	const key = this.cache.buildKey('dsp:top-ters', tenantId, dto);
	// 	return this.cache.wrap(key, () =>
	// 		this.computeTopTerritories(dto, tenantId),
	// 	);
	// }

	private async computeTopTerritories(
		dto: DspTopQueryDto,
		tenantId: string,
	): Promise<PageDto<EntityTopTerItem>> {
		const page = dto.page ?? 1;
		const sortByRevenue = dto.sortBy === 'revenue';
		const sortCol = sortByRevenue ? 'total_revenue_usd_raw' : 'total_views';
		const fromMonth = normalizeDateToFirstOfMonth(dto.fromDate);
		const toMonth = normalizeDateToFirstOfMonth(dto.toDate);

		const { joinSql, filterSql, params } = this.buildDspFilters(
			tenantId,
			dto.pgDspId,
			dto.dspReportId,
			dto.releaseType,
			{
				tableHasDspId: false,
				analyticsVideoScope: getAnalyticsVideoScope(dto),
			},
		);
		params.fromMonth = fromMonth;
		params.toMonth = toMonth;

		const useTopN = dto.topN != null;
		const topNLimit = dto.topN ?? dto.limit;
		const topNSkip = useTopN ? 0 : dto.skip;

		const primaryTable = sortByRevenue
			? CLICKHOUSE_TABLES.SALES_TER_MONTHLY
			: CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY;

		const countSql = `
      SELECT uniq(s.territory_code) AS total
      FROM music_analytics.${primaryTable} s
      ${joinSql}
      WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
        ${filterSql}
    `;

		const dataSql = sortByRevenue
			? `
      SELECT
        s.territory_code AS iso_code,
        sum(s.total_revenue_usd) AS total_revenue_usd_raw,
        toString(sum(s.total_revenue_usd)) AS total_revenue_usd,
        coalesce(sum(tr.total_views), 0) AS total_views
      FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      LEFT JOIN (
        SELECT territory_code, sum(total_quantity) AS total_views
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} tr_sub
        WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
      ) tr ON s.territory_code = tr.territory_code
      WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
        ${filterSql}
      GROUP BY iso_code
      ORDER BY ${sortCol} DESC
      LIMIT ${topNLimit} OFFSET ${topNSkip}
    `
			: `
      SELECT
        s.territory_code AS iso_code,
        sum(s.total_quantity) AS total_views,
        coalesce(sum(sa.total_revenue_usd), 0) AS total_revenue_usd_raw,
        toString(coalesce(sum(sa.total_revenue_usd), 0)) AS total_revenue_usd
      FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      ${joinSql}
      LEFT JOIN (
        SELECT territory_code, sum(total_revenue_usd) AS total_revenue_usd
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} sal_sub
        WHERE sal_sub.period >= toDate({fromMonth:String}) AND sal_sub.period <= toDate({toMonth:String})
      ) sa ON s.territory_code = sa.territory_code
      WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
        ${filterSql}
      GROUP BY iso_code
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

		// Resolve country names
		const isoCodes = dataRows.map((r) => r.iso_code).filter(Boolean);
		const countryByIso2 = new Map<
			string,
			{ name: string; imageUrl: string | null }
		>();
		if (isoCodes.length > 0) {
			const nameRows = await this.entityManager.query(
				`SELECT iso2, name, flag_image_key FROM countries WHERE UPPER(iso2) = ANY($1)`,
				[isoCodes.map((c) => c.toUpperCase())],
			);
			for (const row of nameRows) {
				countryByIso2.set(row.iso2?.toUpperCase(), {
					name: row.name,
					imageUrl: toCountryFlagImageUrl(row.flag_image_key),
				});
			}
		}

		if (useTopN && dto.includeOther && dataRows.length > 0) {
			const totalsSql = sortByRevenue
				? `
        SELECT toString(sum(s.total_revenue_usd)) AS total_revenue_usd, coalesce(sum(tr.total_views), 0) AS total_views
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
        ${joinSql}
        LEFT JOIN (
          SELECT territory_code, sum(total_quantity) AS total_views
          FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} tr_sub
          WHERE tr_sub.period >= toDate({fromMonth:String}) AND tr_sub.period <= toDate({toMonth:String})
        ) tr ON s.territory_code = tr.territory_code
        WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
          ${filterSql}
      `
				: `
        SELECT sum(s.total_quantity) AS total_views, toString(coalesce(sum(sa.total_revenue_usd), 0)) AS total_revenue_usd
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
        ${joinSql}
        LEFT JOIN (
          SELECT territory_code, sum(total_revenue_usd) AS total_revenue_usd
          FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} sal_sub
          WHERE sal_sub.period >= toDate({fromMonth:String}) AND sal_sub.period <= toDate({toMonth:String})
        ) sa ON s.territory_code = sa.territory_code
        WHERE s.period >= toDate({fromMonth:String}) AND s.period <= toDate({toMonth:String})
          ${filterSql}
      `;
			const totalsRow = (
				await this.clickHouseService.query<{
					total_views: string;
					total_revenue_usd: string;
				}>(totalsSql, params)
			)[0];
			const grandTotalViews = Number(totalsRow?.total_views ?? 0);
			const grandTotalRevExact = this.revenueExact(
				totalsRow?.total_revenue_usd,
			);
			const topRevExact = this.addRevenueExact(
				dataRows.map((r) => r.total_revenue_usd),
			);
			const topViews = dataRows.reduce(
				(s, r) => s + Number(r.total_views),
				0,
			);
			const otherRevExact = this.subtractRevenueExact(
				grandTotalRevExact,
				topRevExact,
			);
			const otherViews = Math.max(0, grandTotalViews - topViews);

			const items: EntityTopTerItem[] = dataRows.map((row, i) => {
				const country = countryByIso2.get(row.iso_code?.toUpperCase());
				return {
					rank: i + 1,
					isoCode: row.iso_code,
					territory: country?.name ?? row.iso_code,
					imageUrl: country?.imageUrl ?? null,
					totalViews: Number(row.total_views),
					totalRevenueUsd: row.total_revenue_usd || '0',
				};
			});
			if (this.revenueNumber(otherRevExact) > 0 || otherViews > 0) {
				items.push({
					rank: items.length + 1,
					isoCode: 'other',
					territory: 'Other',
					imageUrl: null,
					totalViews: otherViews,
					totalRevenueUsd: otherRevExact,
				});
			}
			return new PageDto({
				items,
				metadata: { page, pageSize: topNLimit, totalItems },
			});
		}

		const rankOffset = useTopN ? 0 : dto.skip;
		const items: EntityTopTerItem[] = dataRows.map((row, i) => {
			const country = countryByIso2.get(row.iso_code?.toUpperCase());
			return {
				rank: rankOffset + i + 1,
				isoCode: row.iso_code,
				territory: country?.name ?? row.iso_code,
				imageUrl: country?.imageUrl ?? null,
				totalViews: Number(row.total_views),
				totalRevenueUsd: row.total_revenue_usd || '0',
			};
		});
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
