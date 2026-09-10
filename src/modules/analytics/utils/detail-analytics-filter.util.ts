import { ForbiddenException } from '@nestjs/common';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	appendAnalyticsVideoScopeFilter,
	getAnalyticsVideoScope,
} from '../services/analytics-video-scope.service';
import { buildOwnershipJoin } from './ownership-join.util';

export type DetailAnalyticsFilterQuery = {
	tenantId?: string;
	labelId?: string;
	artistId?: string;
	releaseId?: string;
	releaseType?: 'audio' | 'video';
	channelId?: string;
	isrc?: string;
	importSource?: string;
	dspReportId?: string;
	pgDspId?: string;
	analyticsVideoScope?: ReturnType<typeof getAnalyticsVideoScope>;
};

/** Detailed content/source/DSP filters shared by revenue and trend endpoints. */
export function appendDetailFilters(
	tenantId: string,
	query: DetailAnalyticsFilterQuery,
	filterSql: string,
	params: Record<string, any>,
): string {
	const isSystem = checkIsSystemTenant(tenantId);
	if (!isSystem && query.tenantId && query.tenantId !== tenantId) {
		throw new ForbiddenException(
			'Only system tenants can filter another tenantId',
		);
	}

	const effectiveTenantId = isSystem ? query.tenantId : tenantId;
	if (effectiveTenantId) {
		filterSql +=
			" AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) = {detailTenantId:String}";
		params.detailTenantId = effectiveTenantId;
	}
	if (query.labelId) {
		filterSql +=
			" AND coalesce(nullIf(o.label_id, ''), t.label_id) = {detailLabelId:String}";
		params.detailLabelId = query.labelId;
	}
	if (query.artistId) {
		filterSql += ' AND has(t.artist_ids, {artistId:String})';
		params.artistId = query.artistId;
	}
	if (query.releaseId) {
		filterSql += ' AND t.release_id = {detailReleaseId:String}';
		params.detailReleaseId = query.releaseId;
	}
	if (query.releaseType) {
		filterSql += ' AND t.release_type = {detailReleaseType:String}';
		params.detailReleaseType = query.releaseType;
	}
	if (query.channelId) {
		filterSql += ' AND t.channel_id = {channelId:String}';
		params.channelId = query.channelId;
	}
	if (query.isrc) {
		filterSql += ' AND s.isrc = {isrc:String}';
		params.isrc = query.isrc;
	}
	if (query.importSource) {
		filterSql += ' AND s.import_source = {detailImportSource:String}';
		params.detailImportSource = query.importSource;
	}
	if (query.pgDspId) {
		filterSql += ` AND s.dsp_id IN (
        SELECT id_dsps_report
        FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL
        WHERE pg_uuid = {pgDspId:String}
      )`;
		params.pgDspId = query.pgDspId;
	} else if (query.dspReportId) {
		filterSql += ' AND s.dsp_id = {dspReportId:String}';
		params.dspReportId = query.dspReportId;
	}

	filterSql = appendAnalyticsVideoScopeFilter(
		filterSql,
		params,
		getAnalyticsVideoScope(query),
	);

	return filterSql;
}

export function buildDetailFilters(
	tenantId: string,
	query: DetailAnalyticsFilterQuery,
	ownershipPeriod: 'trend' | 'revenue' = 'trend',
	forceTrackJoin = false,
): { joinSql: string; filterSql: string; params: Record<string, any> } {
	const isSystem = checkIsSystemTenant(tenantId);
	const needsTrackJoin =
		forceTrackJoin ||
		!isSystem ||
		!!(
			query.tenantId ||
			query.labelId ||
			query.artistId ||
			query.releaseId ||
			query.releaseType ||
			query.channelId ||
			query.isrc ||
			getAnalyticsVideoScope(query)?.allowedChannelIds !== undefined
		);
	const joinSql = needsTrackJoin
		? `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
         ${buildOwnershipJoin(ownershipPeriod)}`
		: '';
	// A legacy asset has no ledger row until it is first transferred/backfilled.
	// Keep its existing pg_tracks_sync attribution, but never fall back for an
	// ISRC that already has ownership history (that would reassign old facts).
	let filterSql = needsTrackJoin
		? ` AND t.is_deleted = 0
          AND (o.isrc != '' OR s.isrc NOT IN (SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC} FINAL WHERE is_deleted = 0))`
		: '';
	const params: Record<string, any> = {};

	filterSql = appendDetailFilters(tenantId, query, filterSql, params);
	return { joinSql, filterSql, params };
}
