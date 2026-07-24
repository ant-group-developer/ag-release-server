import { Injectable, Logger } from '@nestjs/common';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { RankingQueryDto } from '../dto/analytics-query.dto';
import {
	AnalyticsChannelInfo,
	AnalyticsWorkspaceInfo,
	ArtistRankingItem,
	ChannelRankingItem,
	DspRankingItem,
	LabelRankingItem,
	ReleaseRankingItem,
	ReleaseRankingVideoItem,
	SourceBreakdownItem,
	SourceTypeRankingItem,
	TenantRankingItem,
	TrackRankingItem,
} from '../interfaces/analytics.interface';
import { normalizeSyncedMetadataExternal } from '../utils/metadata-external.util';
import { toDspImageUrl } from '../utils/dsp-image-url.util';
import { AnalyticsCacheService } from './analytics-cache.service';
import { IsrcResolverService } from './isrc-resolver.service';
import { SourceTypeConfigService } from './source-type-config.service';

/**
 * Service xếp hạng hiệu năng (Rankings) cho Tracks, Releases, Artists, Labels.
 * Thực hiện phép INNER JOIN với pg_tracks_sync trực tiếp dưới ClickHouse để phân quyền Multi-Tenant.
 * Hoạt động 100% native ở tầng OLAP ClickHouse, NestJS chỉ làm giàu metadata cho Top N dòng.
 */
@Injectable()
export class RankingService {
	private readonly logger = new Logger(RankingService.name);
	// Audio: yeu cau release_upc chuan (10-14 chu so sau khi strip leading zeros).
	// Video: bypass filter - luon cho pass du release_upc dang placeholder (ISRC-xxx).
	private readonly validReleaseUpcFilter =
		"AND (t.release_type = 'video' OR match(replaceRegexpOne(t.release_upc, '^0+', ''), '^[0-9]{10,14}$'))";

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly isrcResolverService: IsrcResolverService,
		private readonly cache: AnalyticsCacheService,
		private readonly sourceTypeConfigService: SourceTypeConfigService,
	) {}

	// ═══════════════════════════════════════════════════════
	// Helper: Xay dung menh de WHERE cho phan quyen Tenant
	// System-tenant không có sub-filter → bỏ JOIN pg_tracks_sync
	// để thống kê TẤT CẢ ISRCs trong ClickHouse
	// ═══════════════════════════════════════════════════════
	private buildTenantFilters(
		tenantId: string,
		query: RankingQueryDto,
	): { joinSql: string; filterSql: string; params: Record<string, any> } {
		const params: Record<string, any> = {};
		let filterSql = '';

		const isSystem = checkIsSystemTenant(tenantId);
		const hasSubFilter = !!(query.labelId || query.releaseType);

		// System-tenant WITHOUT sub-filters → skip pg_tracks_sync JOIN entirely
		if (isSystem && !hasSubFilter) {
			return { joinSql: '', filterSql: '', params };
		}

		// All other cases: JOIN pg_tracks_sync for tenant/label filtering
		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
		filterSql += ' AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		return { joinSql, filterSql, params };
	}

	private async fetchTrendSourceBreakdown(
		table: string,
		joinSql: string,
		dateFilterSql: string,
		baseFilterSql: string,
		baseParams: Record<string, any>,
		groupFilter: string,
		groupParams: Record<string, any>,
	): Promise<SourceBreakdownItem[]> {
		const sql = `
      SELECT
        s.import_source AS source,
        sum(s.total_quantity) AS quantity
      FROM ${table} s
      ${joinSql}
      WHERE 1=1
        ${dateFilterSql}
        ${baseFilterSql}
        ${groupFilter}
      GROUP BY source
      ORDER BY quantity DESC
    `;
		const rows = await this.clickHouseService.query<{
			source: string;
			quantity: string;
		}>(sql, { ...baseParams, ...groupParams });
		return rows.map((r) => {
			const sourceType = r.source || 'ftp';
			const source = this.sourceTypeConfigService.resolve(sourceType);
			return {
				source: sourceType,
				sourceLabel: source.label,
				imageUrl: source.imageUrl,
				quantity: Number(r.quantity),
			};
		});
	}

	// ═══════════════════════════════════════════════════════
	// 1. TOP TRACKS RANKING
	// ═══════════════════════════════════════════════════════
	async getTopTracks(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<TrackRankingItem>> {
		const key = this.cache.buildKey('rank:tracks', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopTracks(tenantId, query),
		);
	}

	private async computeTopTracks(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<TrackRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		const isSystem = checkIsSystemTenant(tenantId);
		let { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		if (!joinSql) {
			joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			filterSql += ' AND t.is_deleted = 0';
		}
		filterSql += ` ${this.validReleaseUpcFilter}`;

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		if (query.keyword) {
			let matchedIsrcs =
				await this.isrcResolverService.getIsrcsByTrackTitleKeyword(
					query.keyword,
				);
			if (matchedIsrcs.length === 0) {
				matchedIsrcs = ['__none__'];
			}
			filterSql += ' AND s.isrc IN ({matchedIsrcs:Array(String)})';
			params.matchedIsrcs = matchedIsrcs;
		}

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;

		const dateCol = 'reporting_date';

		// Query 1: Đếm tổng số unique tracks
		// Video bypass filter ISRC (video ISRC luon hop le, khong phai placeholder UPC-xxx).
		const countSql = `
      SELECT uniq(s.isrc) AS total
      FROM ${table} s
      ${joinSql}
      WHERE 1=1
        AND (t.release_type = 'video' OR s.isrc NOT LIKE 'UPC-%')
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Query 2: Lấy top tracks đã phân trang trong ClickHouse
		// Video bypass filter ISRC (video ISRC luon hop le, khong phai placeholder UPC-xxx).
		const dataSql = `
      SELECT
        s.isrc AS isrc,
        sum(s.total_quantity) AS totalViews,
        any(t.track_title) AS trackTitle,
        any(t.track_version) AS trackVersion,
        any(t.release_id) AS releaseId,
        any(t.release_title) AS releaseTitle,
        any(t.label_id) AS labelId,
        any(t.label_name) AS labelName,
        any(t.tenant_id) AS tenantId,
        any(t.artist_names) AS artistNames,
        any(t.cover_75) AS cover75,
        any(t.cover_100) AS cover100,
        any(t.cover_160) AS cover160,
        any(t.cover_300) AS cover300,
        any(t.cover_original) AS coverOriginal,
        any(t.track_metadata_spotify) AS trackMetadataSpotify,
        any(t.track_metadata_deezer) AS trackMetadataDeezer,
        any(t.release_metadata_spotify) AS releaseMetadataSpotify,
        any(t.release_metadata_deezer) AS releaseMetadataDeezer
      FROM ${table} s
      ${joinSql}
      WHERE 1=1
        AND (t.release_type = 'video' OR s.isrc NOT LIKE 'UPC-%')
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY isrc
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			isrc: string;
			totalViews: string;
			trackTitle: string;
			trackVersion: string;
			releaseId: string;
			releaseTitle: string;
			labelId: string;
			labelName: string;
			tenantId: string;
			artistNames: string[];
			cover75: string;
			cover100: string;
			cover160: string;
			cover300: string;
			coverOriginal: string;
			trackMetadataSpotify: string;
			trackMetadataDeezer: string;
			releaseMetadataSpotify: string;
			releaseMetadataDeezer: string;
		}>(dataSql, params);
		const tenantMetadata = await this.isrcResolverService.getTenantMetadata(
			[...new Set(paged.map((row) => row.tenantId).filter(Boolean))],
		);

		// Fallback: ISRCs không có trong pg_tracks_sync → lấy metadata từ ClickHouse fact table
		// Chỉ xảy ra với system-tenant (query tất cả ISRCs, không giới hạn pg_tracks_sync)
		const fallbackMap = new Map<
			string,
			{ trackTitle: string; artistName: string; albumTitle: string }
		>();
		if (isSystem) {
			const missingIsrcs = paged
				.filter((r) => !r.trackTitle)
				.map((r) => r.isrc);
			if (missingIsrcs.length > 0) {
				const fbParams = { isrcs: missingIsrcs };
				const fbSql = `
          SELECT
            isrc,
            any(track_title) AS track_title,
            any(artist_name) AS artist_name,
            any(album_title) AS album_title
          FROM ${CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT}
          WHERE isrc IN ({isrcs:Array(String)})
          GROUP BY isrc
        `;
				const fbRows = await this.clickHouseService.query<{
					isrc: string;
					track_title: string;
					artist_name: string;
					album_title: string;
				}>(fbSql, fbParams);
				for (const fb of fbRows) {
					fallbackMap.set(fb.isrc, {
						trackTitle: fb.track_title,
						artistName: fb.artist_name,
						albumTitle: fb.album_title,
					});
				}
			}
		}

		const items: TrackRankingItem[] = paged.map((row, index) => {
			const fallback = fallbackMap.get(row.isrc);
			const artistNames: string[] = Array.isArray(row.artistNames)
				? row.artistNames
				: [];
			const artistName =
				artistNames.join(', ') || fallback?.artistName || '';
			const coverArtThumbnails: ICoverArtThumbnails = {
				'75x75': row.cover75 || null,
				'100x100': row.cover100 || null,
				'160x160': row.cover160 || null,
				'300x300': row.cover300 || null,
				original: row.coverOriginal || null,
			};
			const workspace = row.tenantId
				? tenantMetadata.get(row.tenantId)
				: undefined;
			return {
				rank: query.skip + index + 1,
				isrc: row.isrc,
				title: row.trackTitle || fallback?.trackTitle || '',
				version: row.trackVersion || null,
				artistName,
				releaseId: row.releaseId || '',
				releaseTitle: row.releaseTitle || fallback?.albumTitle || '',
				labelId: row.labelId || null,
				labelName: row.labelName || null,
				totalViews: Number(row.totalViews),
				metadataExternal: normalizeSyncedMetadataExternal(
					row.trackMetadataSpotify,
					row.trackMetadataDeezer,
				),
				workspaces: workspace
					? [{ id: row.tenantId, ...workspace }]
					: [],
				release: {
					coverArtThumbnails,
					metadataExternal: normalizeSyncedMetadataExternal(
						row.releaseMetadataSpotify,
						row.releaseMetadataDeezer,
					),
				},
			};
		});

		// groupBySource: fetch breakdown per track
		if (query.groupBySource && items.length > 0) {
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items.map((item) =>
					this.fetchTrendSourceBreakdown(
						table,
						joinSql,
						dateFilterSql,
						`${dspFilter} ${filterSql}`,
						params,
						'AND s.isrc = {_isrc:String}',
						{ _isrc: item.isrc },
					),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// 2. TOP RELEASES RANKING (NATIVE OLAP GROUP BY release_id)
	// ═══════════════════════════════════════════════════════
	async getTopReleases(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ReleaseRankingItem>> {
		const key = this.cache.buildKey('rank:releases', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopReleases(tenantId, query),
		);
	}

	private async computeTopReleases(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ReleaseRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		let { filterSql, params } = this.buildTenantFilters(tenantId, query);
		params.from = fromDate;
		params.to = toDate;

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		if (query.keyword) {
			let matchedReleaseIds =
				await this.isrcResolverService.getReleaseIdsByKeyword(
					query.keyword,
				);
			if (matchedReleaseIds.length === 0) {
				matchedReleaseIds = ['__none__'];
			}
			filterSql +=
				' AND t.release_id IN ({matchedReleaseIds:Array(String)})';
			params.matchedReleaseIds = matchedReleaseIds;
		}

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
		const dateCol = 'reporting_date';

		// Query 1: Count unique releases
		const countSql = `
      SELECT uniq(t.release_id) AS total
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.release_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Query 2: Aggregate by release_id directly in ClickHouse
		const dataSql = `
      SELECT
        t.release_id AS releaseId,
        uniq(s.isrc) AS trackCount,
        sum(s.total_quantity) AS totalViews,
        any(t.release_title) AS releaseTitle,
        any(t.release_upc) AS releaseUpc,
        any(t.label_id) AS labelId,
        any(t.label_name) AS labelName,
        any(t.tenant_id) AS tenantId,
        any(t.cover_75) AS cover75,
        any(t.cover_100) AS cover100,
        any(t.cover_160) AS cover160,
        any(t.cover_300) AS cover300,
        any(t.cover_original) AS coverOriginal,
        any(t.release_metadata_spotify) AS releaseMetadataSpotify,
        any(t.release_metadata_deezer) AS releaseMetadataDeezer
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.release_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY releaseId
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			releaseId: string;
			trackCount: string;
			totalViews: string;
			releaseTitle: string;
			releaseUpc: string;
			labelId: string;
			labelName: string;
			tenantId: string;
			cover75: string;
			cover100: string;
			cover160: string;
			cover300: string;
			coverOriginal: string;
			releaseMetadataSpotify: string;
			releaseMetadataDeezer: string;
		}>(dataSql, params);
		const tenantMetadata = await this.isrcResolverService.getTenantMetadata(
			[...new Set(paged.map((row) => row.tenantId).filter(Boolean))],
		);

		const items: ReleaseRankingItem[] = paged.map((r, index) => {
			const coverArtThumbnails: ICoverArtThumbnails = {
				'75x75': r.cover75 || null,
				'100x100': r.cover100 || null,
				'160x160': r.cover160 || null,
				'300x300': r.cover300 || null,
				original: r.coverOriginal || null,
			};
			const workspace = r.tenantId
				? tenantMetadata.get(r.tenantId)
				: undefined;
			return {
				rank: query.skip + index + 1,
				releaseId: r.releaseId,
				title: r.releaseTitle || 'Unknown Release',
				upc: r.releaseUpc || null,
				labelId: r.labelId || null,
				labelName: r.labelName || null,
				trackCount: Number(r.trackCount),
				totalViews: Number(r.totalViews),
				metadataExternal: normalizeSyncedMetadataExternal(
					r.releaseMetadataSpotify,
					r.releaseMetadataDeezer,
				),
				workspaces: workspace ? [{ id: r.tenantId, ...workspace }] : [],
				release: { coverArtThumbnails },
			};
		});

		// groupBySource: fetch breakdown per release
		if (query.groupBySource && items.length > 0) {
			const releaseJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items.map((item) =>
					this.fetchTrendSourceBreakdown(
						table,
						releaseJoinSql,
						dateFilterSql,
						`${dspFilter} ${filterSql}`,
						params,
						'AND t.release_id = {_releaseId:String}',
						{ _releaseId: item.releaseId },
					),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// 2b. TOP VIDEO RELEASES RANKING
	// ═══════════════════════════════════════════════════════
	async getTopReleasesVideo(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ReleaseRankingVideoItem>> {
		const key = this.cache.buildKey('rank:releases-video', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopReleasesVideo(tenantId, query),
		);
	}

	private async computeTopReleasesVideo(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ReleaseRankingVideoItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		let { filterSql, params } = this.buildTenantFilters(tenantId, query);
		params.from = fromDate;
		params.to = toDate;

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		if (query.keyword) {
			let matchedReleaseIds =
				await this.isrcResolverService.getReleaseIdsByKeyword(
					query.keyword,
				);
			if (matchedReleaseIds.length === 0) {
				matchedReleaseIds = ['__none__'];
			}
			filterSql +=
				' AND t.release_id IN ({matchedReleaseIds:Array(String)})';
			params.matchedReleaseIds = matchedReleaseIds;
		}

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
		const dateCol = 'reporting_date';

		const countSql = `
      SELECT uniq(t.release_id) AS total
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.release_id != ''
        AND t.release_type = 'video'
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		const dataSql = `
      SELECT
        t.release_id AS releaseId,
        groupUniqArray(20)(t.channel_id) AS channelIds,
        uniq(s.isrc) AS trackCount,
        sum(s.total_quantity) AS totalViews,
        any(t.release_title) AS releaseTitle,
        any(t.release_upc) AS releaseUpc,
        any(t.label_id) AS labelId,
        any(t.label_name) AS labelName,
        any(t.cover_75) AS cover75,
        any(t.cover_100) AS cover100,
        any(t.cover_160) AS cover160,
        any(t.cover_300) AS cover300,
        any(t.cover_original) AS coverOriginal
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.release_id != ''
        AND t.release_type = 'video'
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY releaseId
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			releaseId: string;
			channelIds: string[];
			trackCount: string;
			totalViews: string;
			releaseTitle: string;
			releaseUpc: string;
			labelId: string;
			labelName: string;
			cover75: string;
			cover100: string;
			cover160: string;
			cover300: string;
			coverOriginal: string;
		}>(dataSql, params);

		const releaseIds = paged.map((r) => r.releaseId);
		const allChannelIds = [
			...new Set(
				paged.flatMap((r) => r.channelIds ?? []).filter(Boolean),
			),
		];
		const [channelsMeta, videosMeta] = await Promise.all([
			allChannelIds.length > 0
				? this.isrcResolverService.getChannelMetadata(allChannelIds)
				: Promise.resolve(new Map()),
			this.isrcResolverService.getVideoMetadataByReleaseIds(releaseIds),
		]);

		const items: ReleaseRankingVideoItem[] = paged.map((r, index) => {
			const coverArtThumbnails: ICoverArtThumbnails = {
				'75x75': r.cover75 || null,
				'100x100': r.cover100 || null,
				'160x160': r.cover160 || null,
				'300x300': r.cover300 || null,
				original: r.coverOriginal || null,
			};
			const rowChannelIds = (r.channelIds ?? []).filter(Boolean);

			const channels: AnalyticsChannelInfo[] = rowChannelIds
				.map((id) => {
					const ch = channelsMeta.get(id);
					return ch ? { id, ...ch } : null;
				})
				.filter((c): c is AnalyticsChannelInfo => c !== null);

			const workspacesMap = new Map<string, AnalyticsWorkspaceInfo>();
			rowChannelIds.forEach((id) => {
				const ch = channelsMeta.get(id);
				const tenant = ch?.tenant;
				if (tenant && !workspacesMap.has(tenant.id)) {
					workspacesMap.set(tenant.id, tenant);
				}
			});

			return {
				rank: query.skip + index + 1,
				releaseId: r.releaseId,
				title: r.releaseTitle || 'Unknown Release',
				upc: r.releaseUpc || null,
				labelId: r.labelId || null,
				labelName: r.labelName || null,
				trackCount: Number(r.trackCount),
				totalViews: Number(r.totalViews),
				channels,
				workspaces: [...workspacesMap.values()],
				video: videosMeta.get(r.releaseId) ?? null,
				release: { coverArtThumbnails },
			};
		});

		if (query.groupBySource && items.length > 0) {
			const releaseJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items.map((item) =>
					this.fetchTrendSourceBreakdown(
						table,
						releaseJoinSql,
						dateFilterSql,
						`${dspFilter} ${filterSql}`,
						params,
						'AND t.release_id = {_releaseId:String}',
						{ _releaseId: item.releaseId },
					),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// 3. TOP LABELS RANKING (NATIVE OLAP GROUP BY label_id)
	// ═══════════════════════════════════════════════════════
	async getTopLabels(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<LabelRankingItem>> {
		const key = this.cache.buildKey('rank:labels', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopLabels(tenantId, query),
		);
	}

	private async computeTopLabels(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<LabelRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		let { filterSql, params } = this.buildTenantFilters(tenantId, query);
		params.from = fromDate;
		params.to = toDate;

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		if (query.keyword) {
			let matchedLabelIds =
				await this.isrcResolverService.getLabelIdsByKeyword(
					query.keyword,
				);
			if (matchedLabelIds.length === 0) {
				matchedLabelIds = ['__none__'];
			}
			filterSql += ' AND t.label_id IN ({matchedLabelIds:Array(String)})';
			params.matchedLabelIds = matchedLabelIds;
		}

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
		const dateCol = 'reporting_date';

		// Query 1: Count unique labels
		const countSql = `
      SELECT uniq(t.label_id) AS total
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.label_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Query 2: Aggregate by label_id directly in ClickHouse
		const dataSql = `
      SELECT
        t.label_id AS labelId,
        uniq(t.release_id) AS releaseCount,
        uniq(s.isrc) AS trackCount,
        sum(s.total_quantity) AS totalViews,
        any(t.label_name) AS labelName
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.label_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY labelId
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			labelId: string;
			releaseCount: string;
			trackCount: string;
			totalViews: string;
			labelName: string;
		}>(dataSql, params);
		// Enrich label picture + tenant from Postgres (only top N labels, small set)
		const labelIds = paged.map((l) => l.labelId);
		const labelsMeta =
			await this.isrcResolverService.getLabelMetadata(labelIds);

		const items: LabelRankingItem[] = paged.map((l, index) => {
			const meta = labelsMeta.get(l.labelId);
			const pictureUrl = meta?.picture ?? null;
			return {
				rank: query.skip + index + 1,
				labelId: l.labelId,
				labelName: l.labelName || meta?.name || 'Unknown Label',
				picture: pictureUrl,
				image: pictureUrl,
				releaseCount: Number(l.releaseCount),
				trackCount: Number(l.trackCount),
				totalViews: Number(l.totalViews),
				tenant: meta?.tenant ?? null,
			};
		});

		// groupBySource: fetch breakdown per label
		if (query.groupBySource && items.length > 0) {
			const labelJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items.map((item) =>
					this.fetchTrendSourceBreakdown(
						table,
						labelJoinSql,
						dateFilterSql,
						`${dspFilter} ${filterSql}`,
						params,
						'AND t.label_id = {_labelId:String}',
						{ _labelId: item.labelId },
					),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// TOP CHANNELS RANKING (trend view, video only, GROUP BY channel_id)
	// ═══════════════════════════════════════════════════════
	async getTopChannels(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ChannelRankingItem>> {
		const key = this.cache.buildKey('rank:channels', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopChannels(tenantId, query),
		);
	}

	private async computeTopChannels(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ChannelRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		const { filterSql, params } = this.buildTenantFilters(tenantId, query);
		params.from = fromDate;
		params.to = toDate;

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
		const dateCol = 'reporting_date';

		// Query 1: Count unique channels (channel_id != '' de loai audio + video chua enrich)
		const countSql = `
      SELECT uniq(t.channel_id) AS total
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.channel_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Query 2: Aggregate by channel_id
		const dataSql = `
      SELECT
        t.channel_id AS channelId,
        uniq(t.release_id) AS releaseCount,
        uniq(s.isrc) AS trackCount,
        sum(s.total_quantity) AS totalViews
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.channel_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY channelId
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			channelId: string;
			releaseCount: string;
			trackCount: string;
			totalViews: string;
		}>(dataSql, params);

		const channelIds = paged.map((c) => c.channelId);
		const channelsMeta =
			await this.isrcResolverService.getChannelMetadata(channelIds);

		const items: ChannelRankingItem[] = paged.map((c, index) => {
			const meta = channelsMeta.get(c.channelId);
			return {
				rank: query.skip + index + 1,
				channelId: c.channelId,
				channelName: meta?.name ?? 'Unknown Channel',
				thumbUrl: meta?.thumbUrl ?? null,
				youtubeChannelId: meta?.youtubeChannelId ?? null,
				releaseCount: Number(c.releaseCount),
				trackCount: Number(c.trackCount),
				totalViews: Number(c.totalViews),
				tenant: meta?.tenant ?? null,
			};
		});

		// groupBySource: fetch breakdown per channel
		if (query.groupBySource && items.length > 0) {
			const channelJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items.map((item) =>
					this.fetchTrendSourceBreakdown(
						table,
						channelJoinSql,
						dateFilterSql,
						`${dspFilter} ${filterSql}`,
						params,
						'AND t.channel_id = {_channelId:String}',
						{ _channelId: item.channelId },
					),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// 4. TOP ARTISTS RANKING (NATIVE OLAP với arrayJoin)
	// ═══════════════════════════════════════════════════════
	async getTopArtists(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ArtistRankingItem>> {
		const key = this.cache.buildKey('rank:artists', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopArtists(tenantId, query),
		);
	}

	private async computeTopArtists(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<ArtistRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		let { filterSql, params } = this.buildTenantFilters(tenantId, query);
		params.from = fromDate;
		params.to = toDate;

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		if (query.keyword) {
			let matchedArtistIds =
				await this.isrcResolverService.getArtistIdsByKeyword(
					query.keyword,
				);
			if (matchedArtistIds.length === 0) {
				matchedArtistIds = ['__none__'];
			}
			filterSql +=
				' AND hasAny(t.artist_ids, {matchedArtistIds:Array(String)})';
			params.matchedArtistIds = matchedArtistIds;
		}

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
		const dateCol = 'reporting_date';

		// Query 1: Count unique artists trong khoảng thời gian (phân rã mảng rồi uniq)
		const countSql = `
      SELECT uniq(artistId) AS total
      FROM (
        SELECT arrayJoin(t.artist_ids) AS artistId
        FROM ${table} s
        INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
        WHERE t.is_deleted = 0
          AND s.${dateCol} >= toDate({from:String})
          AND s.${dateCol} <= toDate({to:String})
          ${dspFilter}
          ${filterSql}
      )
      WHERE artistId != '' ${query.keyword ? `AND artistId IN ({matchedArtistIds:Array(String)})` : ''}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Query 2: Aggregate by artistId trực tiếp dưới ClickHouse sử dụng arrayJoin
		const dataSql = `
      SELECT
        arrayJoin(t.artist_ids) AS artistId,
        uniq(s.isrc) AS trackCount,
        sum(s.total_quantity) AS totalViews
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY artistId
      HAVING artistId != '' ${query.keyword ? `AND artistId IN ({matchedArtistIds:Array(String)})` : ''}
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			artistId: string;
			trackCount: string;
			totalViews: string;
		}>(dataSql, params);
		// Enrich artist metadata từ Postgres (chỉ enrich Top N artist đã paged)
		const artistIds = paged.map((a) => a.artistId);
		const artistMetaMap =
			await this.isrcResolverService.getArtistMetadata(artistIds);

		const items: ArtistRankingItem[] = paged.map((a, index) => {
			const meta = artistMetaMap.get(a.artistId);
			const pictureUrl = meta?.picture ?? null;
			return {
				rank: query.skip + index + 1,
				artistId: a.artistId,
				artistName: meta?.name ?? 'Unknown Artist',
				picture: pictureUrl,
				image: pictureUrl,
				profiles: meta?.profiles ?? [],
				country: meta?.country ?? null,
				genre: meta?.genre ?? null,
				trackCount: Number(a.trackCount),
				totalViews: Number(a.totalViews),
			};
		});

		// groupBySource: fetch breakdown per artist
		if (query.groupBySource && items.length > 0) {
			const artistJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items.map((item) =>
					this.fetchTrendSourceBreakdown(
						table,
						artistJoinSql,
						dateFilterSql,
						`${dspFilter} ${filterSql}`,
						params,
						'AND has(t.artist_ids, {_artistId:String})',
						{ _artistId: item.artistId },
					),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// 5. TOP TENANTS RANKING (Trend play counts)
	// ═══════════════════════════════════════════════════════
	async getTopTenants(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<TenantRankingItem>> {
		const key = this.cache.buildKey('rank:tenants', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopTenants(tenantId, query),
		);
	}

	private async computeTopTenants(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<TenantRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';
		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		if (query.keyword) {
			let matchedTenantIds =
				await this.isrcResolverService.getTenantIdsByKeyword(
					query.keyword,
				);
			if (matchedTenantIds.length === 0) {
				matchedTenantIds = ['__none__'];
			}
			filterSql +=
				' AND t.tenant_id IN ({matchedTenantIds:Array(String)})';
			params.matchedTenantIds = matchedTenantIds;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
		const dateCol = 'reporting_date';

		// Count query
		const countSql = `
      SELECT uniq(t.tenant_id) AS total
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.tenant_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Data query
		const dataSql = `
      SELECT
        t.tenant_id AS tenantId,
        sum(s.total_quantity) AS totalViews
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND t.tenant_id != ''
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY tenantId
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			tenantId: string;
			totalViews: string;
		}>(dataSql, params);

		const tenantIds = paged.map((t) => t.tenantId);
		const tenantMetaMap =
			await this.isrcResolverService.getTenantMetadata(tenantIds);

		const items: TenantRankingItem[] = paged.map((r, index) => {
			const meta = tenantMetaMap.get(r.tenantId);
			return {
				rank: query.skip + index + 1,
				tenantId: r.tenantId,
				tenantName: meta?.title ?? 'Unknown Tenant',
				logo: meta?.logo ?? null,
				type: meta?.type ?? null,
				totalViews: Number(r.totalViews),
			};
		});

		// groupBySource: fetch breakdown per tenant
		if (query.groupBySource && items.length > 0) {
			const tenantJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items.map((item) =>
					this.fetchTrendSourceBreakdown(
						table,
						tenantJoinSql,
						dateFilterSql,
						`${dspFilter} ${filterSql}`,
						params,
						'AND t.tenant_id = {_tenantId:String}',
						{ _tenantId: item.tenantId },
					),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// 5b. TOP SOURCE TYPES RANKING (Trend play counts/views, group by import_source)
	// ═══════════════════════════════════════════════════════
	async getTopSourceTypes(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<SourceTypeRankingItem>> {
		const key = this.cache.buildKey('rank:source-types', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTopSourceTypes(tenantId, query),
		);
	}

	private async computeTopSourceTypes(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<SourceTypeRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';
		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
		if (query.dspId) params.dspId = query.dspId;

		const table = query.dspId
			? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
			: CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
		const dateCol = 'reporting_date';

		// Count query
		const countSql = `
      SELECT uniq(s.import_source) AS total
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Data query
		const dataSql = `
      SELECT
        s.import_source AS sourceType,
        sum(s.total_quantity) AS totalViews
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY sourceType
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			sourceType: string;
			totalViews: string;
		}>(dataSql, params);

		const items: SourceTypeRankingItem[] = paged.map((r, index) => {
			const source = this.sourceTypeConfigService.resolve(r.sourceType);
			return {
				rank: query.skip + index + 1,
				sourceType: r.sourceType,
				sourceTypeLabel: source.label,
				imageUrl: source.imageUrl,
				totalViews: Number(r.totalViews),
			};
		});

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}

	// ═══════════════════════════════════════════════════════
	// 6. TOP DSPS RANKING (Trend play counts/views)
	// ═══════════════════════════════════════════════════════
	async getTopDsps(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<DspRankingItem>> {
		const key = this.cache.buildKey('rank:dsps', tenantId, query);
		return this.cache.wrap(key, () => this.computeTopDsps(tenantId, query));
	}

	private async computeTopDsps(
		tenantId: string,
		query: RankingQueryDto,
	): Promise<PageDto<DspRankingItem>> {
		const { fromDate, toDate, page, pageSize } = query;
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';
		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		const table = CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE;
		const dateCol = 'reporting_date';

		// Coalesce: ưu tiên pg_dsps_sync, tiếp đến dsps_report, cuối cùng là dsp_id gốc
		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		if (query.keyword) {
			filterSql += ` AND ${resolvedDspName} ILIKE {keyword:String}`;
			params.keyword = `%${query.keyword}%`;
		}

		// Count query
		const countSql = `
      SELECT uniq(${resolvedDspName}) AS total
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      ${joinExpr}
      WHERE t.is_deleted = 0
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${filterSql}
    `;
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		if (totalItems === 0) {
			return new PageDto({
				items: [],
				metadata: { page, pageSize, totalItems: 0 },
			});
		}

		// Data query
		const dataSql = `
      SELECT
        s.dsp_id AS dspReportId,
        r.pg_uuid AS pgDspId,
        ${resolvedDspName} AS dspName,
        any(p.picture) AS imageUrl,
        sum(s.total_quantity) AS totalViews
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      ${joinExpr}
      WHERE t.is_deleted = 0
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${filterSql}
      GROUP BY dspReportId, pgDspId, dspName
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
		const paged = await this.clickHouseService.query<{
			dspReportId: string;
			pgDspId: string;
			dspName: string;
			imageUrl: string | null;
			totalViews: string;
		}>(dataSql, params);

		const items: DspRankingItem[] = paged.map((r, index) => ({
			rank: query.skip + index + 1,
			pgDspId: r.pgDspId || null,
			dspReportId: r.dspReportId,
			dspName: r.dspName,
			imageUrl: toDspImageUrl(r.imageUrl),
			totalViews: Number(r.totalViews),
		}));

		// groupBySource: fetch breakdown per DSP
		if (query.groupBySource && items.length > 0) {
			const dspTenantJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc ${joinExpr}`;
			const dateFilterSql = `AND s.${dateCol} >= toDate({from:String}) AND s.${dateCol} <= toDate({to:String})`;
			const breakdowns = await Promise.all(
				items
					.filter((item) => item.dspReportId)
					.map((item) =>
						this.fetchTrendSourceBreakdown(
							table,
							dspTenantJoinSql,
							dateFilterSql,
							filterSql,
							params,
							'AND s.dsp_id = {_dspId:String}',
							{ _dspId: item.dspReportId },
						),
					),
			);
			items
				.filter((it) => it.dspReportId)
				.forEach((item, i) => {
					item.bySource = breakdowns[i];
				});
		}

		return new PageDto({ items, metadata: { page, pageSize, totalItems } });
	}
}
