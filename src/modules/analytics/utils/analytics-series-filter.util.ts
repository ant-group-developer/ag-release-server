import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	AnalyticsFilterSetDto,
	AnalyticsSeriesBy,
} from '../dto/analytics-query.dto';
import {
	AnalyticsVideoScope,
	appendAnalyticsVideoScopeFilter,
} from '../services/analytics-video-scope.service';
import {
	buildOwnershipJoin,
	getOwnershipLedgerFallbackPredicate,
	getRevenueLabelExpr,
	getRevenueTenantExpr,
} from './ownership-join.util';

export type AnalyticsSeriesFilterQuery = {
	filters?: AnalyticsFilterSetDto;
	releaseType?: 'audio' | 'video';
	analyticsVideoScope?: AnalyticsVideoScope;
	seriesBy?: AnalyticsSeriesBy;
};

export type ResolvedAnalyticsSeriesBy =
	| Exclude<AnalyticsSeriesBy, 'auto'>
	| 'total';

type FilterBuildResult = {
	joinSql: string;
	filterSql: string;
	params: Record<string, unknown>;
	seriesBy: ResolvedAnalyticsSeriesBy;
	seriesIds: string[];
	seriesExpr: string;
};

const AUTO_SERIES_PRIORITY: Array<{
	seriesBy: ResolvedAnalyticsSeriesBy;
	filterKey: keyof AnalyticsFilterSetDto;
}> = [
	{ seriesBy: 'isrc', filterKey: 'isrcs' },
	{ seriesBy: 'release', filterKey: 'releaseIds' },
	{ seriesBy: 'channel', filterKey: 'channelIds' },
	{ seriesBy: 'artist', filterKey: 'artistIds' },
	{ seriesBy: 'label', filterKey: 'labelIds' },
	{ seriesBy: 'tenant', filterKey: 'tenantIds' },
	{ seriesBy: 'dsp', filterKey: 'dspIds' },
	{ seriesBy: 'importSource', filterKey: 'importSources' },
];

const FILTER_KEY_BY_SERIES: Record<
	ResolvedAnalyticsSeriesBy,
	keyof AnalyticsFilterSetDto | null
> = {
	isrc: 'isrcs',
	release: 'releaseIds',
	channel: 'channelIds',
	artist: 'artistIds',
	label: 'labelIds',
	tenant: 'tenantIds',
	dsp: 'dspIds',
	importSource: 'importSources',
	total: null,
};

const DSP_SERIES_SEPARATOR = '\u001f';

function toDspSeriesId(dspId: {
	pgDspId: string;
	dspReportId: string;
}): string {
	return `${dspId.pgDspId}${DSP_SERIES_SEPARATOR}${dspId.dspReportId}`;
}

function getSeriesIdsForFilter(
	filters: AnalyticsFilterSetDto,
	filterKey: keyof AnalyticsFilterSetDto,
): string[] {
	if (filterKey === 'dspIds') {
		return (filters.dspIds ?? []).map(toDspSeriesId);
	}
	return (filters[filterKey] ?? []) as string[];
}

export function resolveAnalyticsSeriesBy(query: AnalyticsSeriesFilterQuery): {
	seriesBy: ResolvedAnalyticsSeriesBy;
	seriesIds: string[];
} {
	const filters = query.filters ?? {};
	if (!query.seriesBy || query.seriesBy === 'auto') {
		for (const candidate of AUTO_SERIES_PRIORITY) {
			const values = filters[candidate.filterKey];
			if (values?.length) {
				return {
					seriesBy: candidate.seriesBy,
					seriesIds: getSeriesIdsForFilter(
						filters,
						candidate.filterKey,
					),
				};
			}
		}
		return { seriesBy: 'total', seriesIds: ['total'] };
	}

	const seriesBy = query.seriesBy;
	const filterKey = FILTER_KEY_BY_SERIES[seriesBy];
	if (!filterKey) return { seriesBy, seriesIds: ['total'] };

	const values = filters[filterKey];
	if (!values?.length) {
		throw new BadRequestException(
			`filters.${filterKey} is required when seriesBy is ${seriesBy}`,
		);
	}
	return {
		seriesBy,
		seriesIds: getSeriesIdsForFilter(filters, filterKey),
	};
}

/**
 * Builds ClickHouse filters for V2 multi-series line charts. Values in an
 * individual array are OR'ed; separate arrays are intersected. A legitimate
 * empty intersection intentionally returns no fact rows, not an error.
 */
export function buildAnalyticsSeriesFilters(
	tenantId: string,
	query: AnalyticsSeriesFilterQuery,
	ownershipPeriod: 'trend' | 'revenue',
): FilterBuildResult {
	const filters = query.filters ?? {};
	const { seriesBy, seriesIds } = resolveAnalyticsSeriesBy(query);
	const isSystem = checkIsSystemTenant(tenantId);
	const params: Record<string, unknown> = {};

	if (
		!isSystem &&
		filters.tenantIds?.some(
			(selectedTenantId) => selectedTenantId !== tenantId,
		)
	) {
		throw new ForbiddenException(
			'Only system tenants can filter another tenantId',
		);
	}

	const requiresTrackJoin =
		!isSystem ||
		seriesBy === 'release' ||
		seriesBy === 'channel' ||
		seriesBy === 'artist' ||
		seriesBy === 'label' ||
		seriesBy === 'tenant' ||
		Boolean(
			filters.tenantIds?.length ||
			filters.labelIds?.length ||
			filters.artistIds?.length ||
			filters.releaseIds?.length ||
			filters.channelIds?.length ||
			query.releaseType ||
			query.analyticsVideoScope?.allowedChannelIds !== undefined,
		);
	const trackJoinType =
		ownershipPeriod === 'revenue' ? 'LEFT JOIN' : 'INNER JOIN';
	let joinSql = requiresTrackJoin
		? `${trackJoinType} (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc${ownershipPeriod === 'revenue' ? " AND s.isrc NOT IN ('', 'N/A', 'NA')" : ''}
         ${buildOwnershipJoin(ownershipPeriod)}`
		: '';
	let filterSql = requiresTrackJoin
		? ` AND (t.isrc = '' OR t.is_deleted = 0)
          AND ${getOwnershipLedgerFallbackPredicate()}`
		: '';

	const needsDspReportJoin =
		seriesBy === 'dsp' || Boolean(filters.dspIds?.length);
	if (needsDspReportJoin) {
		joinSql += `
      LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL) r
        ON s.dsp_id = r.id_dsps_report`;
	}

	const tenantExpr =
		ownershipPeriod === 'revenue'
			? getRevenueTenantExpr()
			: "coalesce(nullIf(o.tenant_id, ''), t.tenant_id)";
	const labelExpr =
		ownershipPeriod === 'revenue'
			? getRevenueLabelExpr()
			: "coalesce(nullIf(o.label_id, ''), t.label_id)";

	if (!isSystem) {
		filterSql += ` AND ${tenantExpr} = {actorTenantId:String}`;
		params.actorTenantId = tenantId;
	}
	if (filters.tenantIds?.length) {
		filterSql += ` AND ${tenantExpr} IN ({tenantIds:Array(String)})`;
		params.tenantIds = filters.tenantIds;
	}
	if (filters.labelIds?.length) {
		filterSql += ` AND ${labelExpr} IN ({labelIds:Array(String)})`;
		params.labelIds = filters.labelIds;
	}
	if (filters.artistIds?.length) {
		filterSql += ' AND hasAny(t.artist_ids, {artistIds:Array(String)})';
		params.artistIds = filters.artistIds;
	}
	if (seriesBy === 'artist' && filters.artistIds?.length) {
		filterSql +=
			' AND arrayJoin(t.artist_ids) IN ({artistIds:Array(String)})';
	}
	if (filters.releaseIds?.length) {
		filterSql += ' AND t.release_id IN ({releaseIds:Array(String)})';
		params.releaseIds = filters.releaseIds;
	}
	if (filters.channelIds?.length) {
		filterSql += ' AND t.channel_id IN ({channelIds:Array(String)})';
		params.channelIds = filters.channelIds;
	}
	if (filters.isrcs?.length) {
		filterSql += ' AND s.isrc IN ({isrcs:Array(String)})';
		params.isrcs = filters.isrcs;
	}
	if (filters.importSources?.length) {
		filterSql += ' AND s.import_source IN ({importSources:Array(String)})';
		params.importSources = filters.importSources;
	}
	if (filters.dspIds?.length) {
		const dspPairPredicates = filters.dspIds.map((dspId, index) => {
			params[`dspPgId${index}`] = dspId.pgDspId;
			params[`dspReportId${index}`] = dspId.dspReportId;
			return `(r.pg_uuid = {dspPgId${index}:String} AND s.dsp_id = {dspReportId${index}:String})`;
		});
		filterSql += ` AND (${dspPairPredicates.join(' OR ')})`;
	}
	if (query.releaseType) {
		filterSql += ' AND t.release_type = {releaseType:String}';
		params.releaseType = query.releaseType;
	}

	if (query.analyticsVideoScope?.allowedChannelIds !== undefined) {
		filterSql = appendAnalyticsVideoScopeFilter(
			filterSql,
			params,
			query.analyticsVideoScope,
			't',
		);
	}

	const seriesExpr: Record<ResolvedAnalyticsSeriesBy, string> = {
		isrc: 's.isrc',
		release: 't.release_id',
		channel: 't.channel_id',
		artist: 'arrayJoin(t.artist_ids)',
		label: labelExpr,
		tenant: tenantExpr,
		dsp: `concat(r.pg_uuid, '${DSP_SERIES_SEPARATOR}', s.dsp_id)`,
		importSource: 's.import_source',
		total: "'total'",
	};

	return {
		joinSql,
		filterSql,
		params,
		seriesBy,
		seriesIds,
		seriesExpr: seriesExpr[seriesBy],
	};
}
