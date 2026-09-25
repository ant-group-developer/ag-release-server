import { Injectable, Logger } from '@nestjs/common';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { DashboardAnalyticsQueryDto } from '../dto/analytics-query.dto';
import { toDspImageUrl } from '../utils/dsp-image-url.util';
import {
	buildOwnershipJoin,
	getOwnershipLedgerFallbackPredicate,
	getRevenueTenantExpr,
} from '../utils/ownership-join.util';
import { AnalyticsCacheService } from './analytics-cache.service';
import {
	appendAnalyticsVideoScopeFilter,
	getAnalyticsVideoScope,
} from './analytics-video-scope.service';
import { IsrcResolverService } from './isrc-resolver.service';

@Injectable()
export class DashboardAnalyticsService {
	private readonly logger = new Logger(DashboardAnalyticsService.name);

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly isrcResolverService: IsrcResolverService,
		private readonly cache: AnalyticsCacheService,
	) {}

	/**
	 * Helper: Build tenant WHERE clause filters for ClickHouse
	 */
	private buildTenantFilters(
		tenantId: string,
		query: DashboardAnalyticsQueryDto,
	): { joinSql: string; filterSql: string; params: Record<string, any> } {
		const params: Record<string, any> = {};
		let filterSql = '';

		const isSystem = checkIsSystemTenant(tenantId);

		// A restricted video scope needs pg_tracks_sync even for the system tenant.
		if (
			isSystem &&
			!query.releaseType &&
			getAnalyticsVideoScope(query)?.allowedChannelIds === undefined
		) {
			return { joinSql: '', filterSql: '', params };
		}

		const ownershipPeriod = query.type === 'stream' ? 'trend' : 'revenue';
		const trackJoin =
			ownershipPeriod === 'revenue' ? 'LEFT JOIN' : 'INNER JOIN';
		const joinSql = `
      ${trackJoin} (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc${ownershipPeriod === 'revenue' ? " AND s.isrc NOT IN ('', 'N/A', 'NA')" : ''}
      ${buildOwnershipJoin(ownershipPeriod, 's.period')}`;
		filterSql += ` AND (t.isrc = '' OR t.is_deleted = 0)
      AND ${getOwnershipLedgerFallbackPredicate()}`;

		if (!isSystem) {
			const tenantExpr =
				ownershipPeriod === 'revenue'
					? getRevenueTenantExpr()
					: "coalesce(nullIf(o.tenant_id, ''), t.tenant_id)";
			filterSql += ` AND ${tenantExpr} = {tenantId:String}`;
			params.tenantId = tenantId;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		filterSql = appendAnalyticsVideoScopeFilter(
			filterSql,
			params,
			getAnalyticsVideoScope(query),
		);

		return { joinSql, filterSql, params };
	}

	/**
	 * Thống kê tổng quan DSP (Stream hoặc Revenue)
	 */
	async getDspDashboard(tenantId: string, query: DashboardAnalyticsQueryDto) {
		const key = this.cache.buildKey('dash:dsp', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeDspDashboard(tenantId, query),
		);
	}

	private async computeDspDashboard(
		tenantId: string,
		query: DashboardAnalyticsQueryDto,
	) {
		const { topN = 5, includeOther = true } = query;
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);

		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		const table =
			query.type === 'stream'
				? CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY
				: CLICKHOUSE_TABLES.SALES_DSP_MONTHLY;

		const selectVal =
			query.type === 'stream'
				? 'sum(s.total_quantity)'
				: 'sum(s.total_revenue_usd)';

		params.from = normalizeDateToFirstOfMonth(query.fromDate);
		params.to = normalizeDateToFirstOfMonth(query.toDate);

		const sql = `
      SELECT
        s.dsp_id AS dspReportId,
        r.pg_uuid AS pgDspId,
        ${resolvedDspName} AS name,
        p.picture AS imageUrl,
        ${selectVal} AS value
      FROM ${table} s
      ${joinSql}
      ${joinExpr}
      WHERE s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY dspReportId, pgDspId, name, imageUrl
      ORDER BY value DESC
    `;

		const rows = await this.clickHouseService.query<{
			dspReportId: string;
			pgDspId: string | null;
			name: string;
			imageUrl: string | null;
			value: string;
		}>(sql, params);

		const sorted = rows
			.map((r) => ({
				pgDspId: r.pgDspId || null,
				dspReportId: r.dspReportId,
				name: r.name || 'Unknown DSP',
				imageUrl: toDspImageUrl(r.imageUrl),
				value: Number(r.value || 0),
			}))
			.sort((a, b) => b.value - a.value);

		if (sorted.length <= topN) {
			return sorted;
		}

		const topItems = sorted.slice(0, topN);
		if (includeOther) {
			const otherValue = sorted
				.slice(topN)
				.reduce((acc, item) => acc + item.value, 0);
			if (otherValue > 0) {
				topItems.push({
					pgDspId: null,
					dspReportId: '',
					name: 'Other',
					imageUrl: null,
					value: otherValue,
				});
			}
		}
		return topItems.sort((a, b) => b.value - a.value);
	}

	/**
	 * Thống kê tổng quan Label (Stream hoặc Revenue)
	 */
	async getLabelDashboard(
		tenantId: string,
		query: DashboardAnalyticsQueryDto,
	) {
		const key = this.cache.buildKey('dash:label', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeLabelDashboard(tenantId, query),
		);
	}

	private async computeLabelDashboard(
		tenantId: string,
		query: DashboardAnalyticsQueryDto,
	) {
		const { topN = 5, includeOther = true } = query;
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = {};

		let tenantFilter = '';
		if (!isSystem) {
			tenantFilter =
				"AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) = {tenantId:String}";
			params.tenantId = tenantId;
		}

		let releaseTypeFilter = '';
		if (query.releaseType) {
			releaseTypeFilter = 'AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}
		const videoScopeFilter = appendAnalyticsVideoScopeFilter(
			'',
			params,
			getAnalyticsVideoScope(query),
		);

		let sql = '';
		if (query.type === 'stream') {
			params.from = query.fromDate;
			params.to = query.toDate;
			sql = `
        SELECT
          coalesce(nullIf(o.label_id, ''), t.label_id) AS labelId,
          sum(s.total_quantity) AS value
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE} s
        INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
        ${buildOwnershipJoin('trend')}
        WHERE t.is_deleted = 0 AND coalesce(nullIf(o.label_id, ''), t.label_id) != ''
          AND ${getOwnershipLedgerFallbackPredicate()}
          AND s.reporting_date >= toDate({from:String})
          AND s.reporting_date <= toDate({to:String})
          ${tenantFilter}
          ${releaseTypeFilter}
						${videoScopeFilter}
        GROUP BY labelId
      `;
		} else {
			params.from = normalizeDateToFirstOfMonth(query.fromDate);
			params.to = normalizeDateToFirstOfMonth(query.toDate);
			sql = `
        SELECT
          coalesce(nullIf(o.label_id, ''), t.label_id) AS labelId,
          sum(s.total_revenue_usd) AS value
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_ISRC_MONTHLY} s
        INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
        ${buildOwnershipJoin('revenue')}
        WHERE t.is_deleted = 0 AND coalesce(nullIf(o.label_id, ''), t.label_id) != ''
          AND ${getOwnershipLedgerFallbackPredicate()}
          AND s.period >= toDate({from:String})
          AND s.period <= toDate({to:String})
          ${tenantFilter}
          ${releaseTypeFilter}
						${videoScopeFilter}
        GROUP BY labelId
      `;
		}

		const rows = await this.clickHouseService.query<{
			labelId: string;
			value: string;
		}>(sql, params);

		const sorted = rows
			.map((r) => ({
				labelId: r.labelId,
				value: Number(r.value || 0),
			}))
			.sort((a, b) => b.value - a.value);

		const topLabelsRaw = sorted.slice(0, topN);
		const topLabelIds = topLabelsRaw.map((l) => l.labelId).filter(Boolean);

		let labelsMeta = new Map<string, { name: string }>();
		if (topLabelIds.length > 0) {
			labelsMeta =
				await this.isrcResolverService.getLabelMetadata(topLabelIds);
		}

		const result = topLabelsRaw.map((l) => {
			const meta = labelsMeta.get(l.labelId);
			return {
				name: meta?.name || 'Unknown Label',
				value: l.value,
			};
		});

		if (includeOther && sorted.length > topN) {
			const otherValue = sorted
				.slice(topN)
				.reduce((acc, l) => acc + l.value, 0);
			if (otherValue > 0) {
				result.push({ name: 'Other', value: otherValue });
			}
		}
		return result.sort((a, b) => b.value - a.value);
	}

	/**
	 * Thống kê tổng quan Artist (Stream hoặc Revenue)
	 */
	async getArtistDashboard(
		tenantId: string,
		query: DashboardAnalyticsQueryDto,
	) {
		const key = this.cache.buildKey('dash:artist', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeArtistDashboard(tenantId, query),
		);
	}

	private async computeArtistDashboard(
		tenantId: string,
		query: DashboardAnalyticsQueryDto,
	) {
		const { topN = 5, includeOther = true } = query;
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = {};

		let tenantFilter = '';
		if (!isSystem) {
			tenantFilter =
				"AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) = {tenantId:String}";
			params.tenantId = tenantId;
		}

		let releaseTypeFilter = '';
		if (query.releaseType) {
			releaseTypeFilter = 'AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}
		const videoScopeFilter = appendAnalyticsVideoScopeFilter(
			'',
			params,
			getAnalyticsVideoScope(query),
		);

		let sql = '';
		if (query.type === 'stream') {
			params.from = query.fromDate;
			params.to = query.toDate;
			sql = `
        SELECT
          arrayJoin(t.artist_ids) AS artistId,
          sum(s.total_quantity) AS value
        FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE} s
        INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
        ${buildOwnershipJoin('trend')}
        WHERE t.is_deleted = 0 AND artistId != ''
          AND ${getOwnershipLedgerFallbackPredicate()}
          AND s.reporting_date >= toDate({from:String})
          AND s.reporting_date <= toDate({to:String})
          ${tenantFilter}
          ${releaseTypeFilter}
						${videoScopeFilter}
        GROUP BY artistId
      `;
		} else {
			params.from = normalizeDateToFirstOfMonth(query.fromDate);
			params.to = normalizeDateToFirstOfMonth(query.toDate);
			sql = `
        SELECT
          arrayJoin(t.artist_ids) AS artistId,
          sum(s.total_revenue_usd) AS value
        FROM music_analytics.${CLICKHOUSE_TABLES.SALES_ISRC_MONTHLY} s
        INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
        ${buildOwnershipJoin('revenue')}
        WHERE t.is_deleted = 0 AND artistId != ''
          AND ${getOwnershipLedgerFallbackPredicate()}
          AND s.period >= toDate({from:String})
          AND s.period <= toDate({to:String})
          ${tenantFilter}
          ${releaseTypeFilter}
						${videoScopeFilter}
        GROUP BY artistId
      `;
		}

		const rows = await this.clickHouseService.query<{
			artistId: string;
			value: string;
		}>(sql, params);

		const sorted = rows
			.map((r) => ({
				artistId: r.artistId,
				value: Number(r.value || 0),
			}))
			.sort((a, b) => b.value - a.value);

		const topArtistsRaw = sorted.slice(0, topN);
		const topArtistIds = topArtistsRaw
			.map((a) => a.artistId)
			.filter(Boolean);

		let artistMeta = new Map<string, { name: string }>();
		if (topArtistIds.length > 0) {
			artistMeta =
				await this.isrcResolverService.getArtistMetadata(topArtistIds);
		}

		const result = topArtistsRaw.map((a) => {
			const meta = artistMeta.get(a.artistId);
			return {
				name: meta?.name || 'Unknown Artist',
				value: a.value,
			};
		});

		if (includeOther && sorted.length > topN) {
			const otherValue = sorted
				.slice(topN)
				.reduce((acc, a) => acc + a.value, 0);
			if (otherValue > 0) {
				result.push({ name: 'Other', value: otherValue });
			}
		}
		return result.sort((a, b) => b.value - a.value);
	}
}
