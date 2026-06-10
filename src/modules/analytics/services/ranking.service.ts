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
} from '../interfaces/analytics.interface';

/**
 * Service xếp hạng hiệu năng (Rankings) cho Tracks, Releases, Artists, Labels.
 * Thực hiện phép INNER JOIN với pg_tracks_sync trực tiếp dưới ClickHouse để phân quyền Multi-Tenant.
 * Hoạt động 100% native ở tầng OLAP ClickHouse, NestJS chỉ làm giàu metadata cho Top N dòng.
 */
@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

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
    const joinSql = `INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc`;
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
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
    if (query.dspId) params.dspId = query.dspId;

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

    const items: TrackRankingItem[] = paged.map((row, index) => {
      const meta = metadataMap.get(row.isrc);
      const fallback = fallbackMap.get(row.isrc);
      return {
        rank: query.skip + index + 1,
        isrc: row.isrc,
        title: meta?.trackTitle ?? fallback?.trackTitle ?? '',
        version: meta?.trackVersion ?? null,
        artistName: artistNameMap.get(row.isrc) ?? fallback?.artistName ?? '',
        releaseId: meta?.releaseId ?? '',
        releaseTitle: meta?.releaseTitle ?? fallback?.albumTitle ?? '',
        totalViews: Number(row.totalViews),
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
    const { filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
    if (query.dspId) params.dspId = query.dspId;

    const table = query.dspId
      ? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
      : CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
    const dateCol = 'reporting_date';

    // Query 1: Count unique releases
    const countSql = `
      SELECT uniq(t.release_id) AS total
      FROM ${table} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
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
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
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

    const items: ReleaseRankingItem[] = paged.map((r, index) => {
      const meta = metaMap.get(r.releaseId);
      return {
        rank: query.skip + index + 1,
        releaseId: r.releaseId,
        title: meta?.releaseTitle ?? 'Unknown Release',
        upc: meta?.releaseUpc ?? null,
        labelId: meta?.labelId ?? null,
        labelName: meta?.labelName ?? null,
        trackCount: Number(r.trackCount),
        totalViews: Number(r.totalViews),
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
    const { filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
    if (query.dspId) params.dspId = query.dspId;

    const table = query.dspId
      ? CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE
      : CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE;
    const dateCol = 'reporting_date';

    // Query 1: Count unique labels
    const countSql = `
      SELECT uniq(t.label_id) AS total
      FROM ${table} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
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
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
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

    // Enrich label info from PostgreSQL
    const allTracksMeta =
      await this.isrcResolverService.getAllTrackMetadataForTenant(tenantId);
    const labelNamesMap = new Map<string, string>();
    for (const m of allTracksMeta) {
      if (m.labelId) {
        labelNamesMap.set(m.labelId, m.labelName ?? 'Unknown Label');
      }
    }

    const items: LabelRankingItem[] = paged.map((l, index) => ({
      rank: query.skip + index + 1,
      labelId: l.labelId,
      labelName: labelNamesMap.get(l.labelId) ?? 'Unknown Label',
      picture: null,
      releaseCount: Number(l.releaseCount),
      trackCount: Number(l.trackCount),
      totalViews: Number(l.totalViews),
    }));

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
    const { filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    const dspFilter = query.dspId ? 'AND s.dsp_id = {dspId:String}' : '';
    if (query.dspId) params.dspId = query.dspId;

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
        INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
        WHERE t.is_deleted = 0
          AND s.${dateCol} >= toDate({from:String})
          AND s.${dateCol} <= toDate({to:String})
          ${dspFilter}
          ${filterSql}
      )
      WHERE artistId != ''
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
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND s.${dateCol} >= toDate({from:String})
        AND s.${dateCol} <= toDate({to:String})
        ${dspFilter}
        ${filterSql}
      GROUP BY artistId
      HAVING artistId != ''
      ORDER BY totalViews DESC
      LIMIT ${query.limit} OFFSET ${query.skip}
    `;
    const paged = await this.clickHouseService.query<{
      artistId: string;
      trackCount: string;
      totalViews: string;
    }>(dataSql, params);

    // Enrich artist metadata từ Postgres (chỉ enrich Top N artist đã paged)
    const artists =
      await this.isrcResolverService.getAllIsrcArtistMappingsForTenant(
        tenantId,
      );
    const artistMetaMap = new Map<string, any>();
    for (const a of artists) {
      artistMetaMap.set(a.artistId, a);
    }

    const items: ArtistRankingItem[] = paged.map((a, index) => {
      const meta = artistMetaMap.get(a.artistId);
      return {
        rank: query.skip + index + 1,
        artistId: a.artistId,
        artistName: meta?.artistName ?? 'Unknown Artist',
        picture: meta?.artistPicture ?? null,
        trackCount: Number(a.trackCount),
        totalViews: Number(a.totalViews),
      };
    });

    return new PageDto({ items, metadata: { page, pageSize, totalItems } });
  }
}
