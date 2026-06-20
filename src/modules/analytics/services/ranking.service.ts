import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { IsrcResolverService } from './isrc-resolver.service';
import { RankingQueryDto } from '../dto/analytics-query.dto';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
  TrackRankingItem,
  ReleaseRankingItem,
  ArtistRankingItem,
  LabelRankingItem,
  TenantRankingItem,
  DspRankingItem,
} from '../interfaces/analytics.interface';
import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';

/**
 * Service xếp hạng hiệu năng (Rankings) cho Tracks, Releases, Artists, Labels.
 * Thực hiện phép INNER JOIN với pg_tracks_sync trực tiếp dưới ClickHouse để phân quyền Multi-Tenant.
 * Hoạt động 100% native ở tầng OLAP ClickHouse, NestJS chỉ làm giàu metadata cho Top N dòng.
 */
@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);
  private readonly validReleaseUpcFilter = "AND match(replaceRegexpOne(t.release_upc, '^0+', ''), '^[0-9]{10,14}$')";

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly isrcResolverService: IsrcResolverService,
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
    const hasSubFilter = !!query.labelId;

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

    return { joinSql, filterSql, params };
  }

  // ═══════════════════════════════════════════════════════
  // 1. TOP TRACKS RANKING
  // ═══════════════════════════════════════════════════════
  async getTopTracks(
    tenantId: string,
    query: RankingQueryDto,
  ): Promise<PageDto<TrackRankingItem>> {
    const { fromDate, toDate, page, pageSize } = query;
    const isSystem = checkIsSystemTenant(tenantId);
    let { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
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
      let matchedIsrcs = await this.isrcResolverService.getIsrcsByTrackTitleKeyword(query.keyword);
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
    const countSql = `
      SELECT uniq(s.isrc) AS total
      FROM ${table} s
      ${joinSql}
      WHERE 1=1
        AND s.isrc NOT LIKE 'UPC-%'
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
    `;
    const countResult = await this.clickHouseService.query<{ total: string }>(
      countSql,
      params,
    );
    const totalItems = Number(countResult[0]?.total ?? 0);

    if (totalItems === 0) {
      return new PageDto({
        items: [],
        metadata: { page, pageSize, totalItems: 0 },
      });
    }

    // Query 2: Lấy top tracks đã phân trang trong ClickHouse
    const dataSql = `
      SELECT
        s.isrc AS isrc,
        sum(s.total_quantity) AS totalViews
      FROM ${table} s
      ${joinSql}
      WHERE 1=1
        AND s.isrc NOT LIKE 'UPC-%'
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
    }>(dataSql, params);

    // Enrich metadata từ Postgres (chỉ enrich Top N đã paged -> cực nhanh)
    const topIsrcs = paged.map((r) => r.isrc);
    const [metadataMap, artistMappings] = await Promise.all([
      this.isrcResolverService.getTrackMetadataMap(topIsrcs),
      this.isrcResolverService.getIsrcArtistMappings(topIsrcs),
    ]);

    const artistNameMap = new Map<string, string>();
    for (const mapping of artistMappings) {
      const current = artistNameMap.get(mapping.isrc);
      artistNameMap.set(
        mapping.isrc,
        current ? `${current}, ${mapping.artistName}` : mapping.artistName,
      );
    }

    // Fallback: ISRCs không có trong pg_tracks_sync → lấy metadata từ ClickHouse
    // Chỉ xảy ra với system-tenant (query tất cả ISRCs, không giới hạn pg_tracks_sync)
    const fallbackMap = new Map<string, { trackTitle: string; artistName: string; albumTitle: string }>();
    if (isSystem) {
      const missingIsrcs = topIsrcs.filter((isrc) => !metadataMap.has(isrc));
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

    const releaseIds = Array.from(metadataMap.values())
      .map((m) => m.releaseId)
      .filter(Boolean);
    const releaseImageMap = await this.isrcResolverService.getReleaseImages(releaseIds);

    const items: TrackRankingItem[] = paged.map((row, index) => {
      const meta = metadataMap.get(row.isrc);
      const fallback = fallbackMap.get(row.isrc);
      const releaseId = meta?.releaseId ?? '';
      
      let releaseObj: { coverArtThumbnails: ICoverArtThumbnails } | null = null;
      if (releaseId) {
        const coverArtThumbnails = releaseImageMap.get(releaseId) ?? {
          '75x75': null,
          '100x100': null,
          '160x160': null,
          '300x300': null,
          original: null,
        };
        releaseObj = { coverArtThumbnails };
      }

      return {
        rank: query.skip + index + 1,
        isrc: row.isrc,
        title: meta?.trackTitle ?? fallback?.trackTitle ?? '',
        version: meta?.trackVersion ?? null,
        artistName: artistNameMap.get(row.isrc) ?? fallback?.artistName ?? '',
        releaseId,
        releaseTitle: meta?.releaseTitle ?? fallback?.albumTitle ?? '',
        totalViews: Number(row.totalViews),
        release: releaseObj,
      };
    });

    return new PageDto({ items, metadata: { page, pageSize, totalItems } });
  }

  // ═══════════════════════════════════════════════════════
  // 2. TOP RELEASES RANKING (NATIVE OLAP GROUP BY release_id)
  // ═══════════════════════════════════════════════════════
  async getTopReleases(
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
      let matchedReleaseIds = await this.isrcResolverService.getReleaseIdsByKeyword(query.keyword);
      if (matchedReleaseIds.length === 0) {
        matchedReleaseIds = ['__none__'];
      }
      filterSql += ' AND t.release_id IN ({matchedReleaseIds:Array(String)})';
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
    const countResult = await this.clickHouseService.query<{ total: string }>(
      countSql,
      params,
    );
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
        sum(s.total_quantity) AS totalViews
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
    }>(dataSql, params);
    // Enrich release metadata from PostgreSQL (only enrich top N releases)
    const releasesMeta =
      await this.isrcResolverService.getAllTrackMetadataForTenant(tenantId);
    const metaMap = new Map<string, any>();
    for (const m of releasesMeta) {
      metaMap.set(m.releaseId, m);
    }

    const releaseIds = paged.map((r) => r.releaseId);
    const imageMap = await this.isrcResolverService.getReleaseImages(releaseIds);

    const items: ReleaseRankingItem[] = paged.map((r, index) => {
      const meta = metaMap.get(r.releaseId);
      const coverArtThumbnails = imageMap.get(r.releaseId) ?? {
        '75x75': null,
        '100x100': null,
        '160x160': null,
        '300x300': null,
        original: null,
      };
      return {
        rank: query.skip + index + 1,
        releaseId: r.releaseId,
        title: meta?.releaseTitle ?? 'Unknown Release',
        upc: meta?.releaseUpc ?? null,
        labelId: meta?.labelId ?? null,
        labelName: meta?.labelName ?? null,
        trackCount: Number(r.trackCount),
        totalViews: Number(r.totalViews),
        release: {
          coverArtThumbnails,
        },
      };
    });

    return new PageDto({ items, metadata: { page, pageSize, totalItems } });
  }

  // ═══════════════════════════════════════════════════════
  // 3. TOP LABELS RANKING (NATIVE OLAP GROUP BY label_id)
  // ═══════════════════════════════════════════════════════
  async getTopLabels(
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
      let matchedLabelIds = await this.isrcResolverService.getLabelIdsByKeyword(query.keyword);
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
    const countResult = await this.clickHouseService.query<{ total: string }>(
      countSql,
      params,
    );
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
        sum(s.total_quantity) AS totalViews
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
    }>(dataSql, params);
    // Enrich label metadata from PostgreSQL (only enrich top N labels)
    const labelIds = paged.map((l) => l.labelId);
    const labelsMeta = await this.isrcResolverService.getLabelMetadata(labelIds);

    const items: LabelRankingItem[] = paged.map((l, index) => {
      const meta = labelsMeta.get(l.labelId);
      const pictureUrl = meta?.picture ?? null;
      return {
        rank: query.skip + index + 1,
        labelId: l.labelId,
        labelName: meta?.name ?? 'Unknown Label',
        picture: pictureUrl,
        image: pictureUrl,
        releaseCount: Number(l.releaseCount),
        trackCount: Number(l.trackCount),
        totalViews: Number(l.totalViews),
      };
    });

    return new PageDto({ items, metadata: { page, pageSize, totalItems } });
  }

  // ═══════════════════════════════════════════════════════
  // 4. TOP ARTISTS RANKING (NATIVE OLAP với arrayJoin)
  // ═══════════════════════════════════════════════════════
  async getTopArtists(
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
      let matchedArtistIds = await this.isrcResolverService.getArtistIdsByKeyword(query.keyword);
      if (matchedArtistIds.length === 0) {
        matchedArtistIds = ['__none__'];
      }
      filterSql += ' AND hasAny(t.artist_ids, {matchedArtistIds:Array(String)})';
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
    const countResult = await this.clickHouseService.query<{ total: string }>(
      countSql,
      params,
    );
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
    const artistMetaMap = await this.isrcResolverService.getArtistMetadata(artistIds);

    const items: ArtistRankingItem[] = paged.map((a, index) => {
      const meta = artistMetaMap.get(a.artistId);
      const pictureUrl = meta?.picture ?? null;
      return {
        rank: query.skip + index + 1,
        artistId: a.artistId,
        artistName: meta?.name ?? 'Unknown Artist',
        picture: pictureUrl,
        image: pictureUrl,
        trackCount: Number(a.trackCount),
        totalViews: Number(a.totalViews),
      };
    });

    return new PageDto({ items, metadata: { page, pageSize, totalItems } });
  }

  // ═══════════════════════════════════════════════════════
  // 5. TOP TENANTS RANKING (Trend play counts)
  // ═══════════════════════════════════════════════════════
  async getTopTenants(
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
      let matchedTenantIds = await this.isrcResolverService.getTenantIdsByKeyword(query.keyword);
      if (matchedTenantIds.length === 0) {
        matchedTenantIds = ['__none__'];
      }
      filterSql += ' AND t.tenant_id IN ({matchedTenantIds:Array(String)})';
      params.matchedTenantIds = matchedTenantIds;
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
    const countResult = await this.clickHouseService.query<{ total: string }>(
      countSql,
      params,
    );
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
    const tenantMetaMap = await this.isrcResolverService.getTenantMetadata(tenantIds);

    const items: TenantRankingItem[] = paged.map((r, index) => {
      const meta = tenantMetaMap.get(r.tenantId);
      return {
        rank: query.skip + index + 1,
        tenantId: r.tenantId,
        tenantName: meta?.title ?? 'Unknown Tenant',
        logo: meta?.logo ?? null,
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
    const { fromDate, toDate, page, pageSize } = query;
    const isSystem = checkIsSystemTenant(tenantId);

    const params: Record<string, any> = { from: fromDate, to: toDate };
    let filterSql = 'AND t.is_deleted = 0';
    if (!isSystem) {
      filterSql += ' AND t.tenant_id = {tenantId:String}';
      params.tenantId = tenantId;
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
    const countResult = await this.clickHouseService.query<{ total: string }>(
      countSql,
      params,
    );
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
        s.dsp_id AS dspId,
        ${resolvedDspName} AS dspName,
        sum(s.total_quantity) AS totalViews
      FROM ${table} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      ${joinExpr}
      WHERE t.is_deleted = 0
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${filterSql}
      GROUP BY dspId, dspName
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
    const paged = await this.clickHouseService.query<{
      dspId: string;
      dspName: string;
      totalViews: string;
    }>(dataSql, params);

    const items: DspRankingItem[] = paged.map((r, index) => ({
      rank: query.skip + index + 1,
      dspId: r.dspId,
      dspName: r.dspName,
      totalViews: Number(r.totalViews),
    }));

    return new PageDto({ items, metadata: { page, pageSize, totalItems } });
  }
}
