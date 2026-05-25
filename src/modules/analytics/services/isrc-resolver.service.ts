import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Track } from 'src/modules/track/entities/track.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import {
  TrackMetadata,
  IsrcArtistMapping,
} from '../interfaces/analytics.interface';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';

@Injectable()
export class IsrcResolverService {
  private readonly logger = new Logger(IsrcResolverService.name);

  constructor(
    @InjectRepository(Track)
    private readonly trackRepo: Repository<Track>,
    @InjectRepository(Release)
    private readonly releaseRepo: Repository<Release>,
    @InjectRepository(Label)
    private readonly labelRepo: Repository<Label>,
    @InjectRepository(Artist)
    private readonly artistRepo: Repository<Artist>,
    @InjectRepository(TrackArtist)
    private readonly trackArtistRepo: Repository<TrackArtist>,
  ) {}

  /**
   * Lấy danh sách ISRCs thuộc tenant.
   * Đường đi: releases.tenant_id → tracks.release_id → tracks.isrc
   * System tenant (super admin) → trả về tất cả ISRCs, không filter.
   */
  async getIsrcsByTenantId(tenantId: string): Promise<string[]> {
    const qb = this.trackRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.isrc', 'isrc')
      .innerJoin('t.release', 'r')
      .where('t.isrc IS NOT NULL')
      .andWhere("t.isrc != ''");

    if (!checkIsSystemTenant(tenantId)) {
      qb.andWhere('r.tenantId = :tenantId', { tenantId });
    }

    const results = await qb.getRawMany<{ isrc: string }>();
    const isrcs = results.map((r) => r.isrc);
    this.logger.debug(`Tenant ${tenantId}: resolved ${isrcs.length} ISRCs`);
    return isrcs;
  }

  /**
   * Lấy ISRCs filtered theo labelId (trong scope tenant)
   */
  async getIsrcsByLabelId(
    tenantId: string,
    labelId: string,
  ): Promise<string[]> {
    const qb = this.trackRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.isrc', 'isrc')
      .innerJoin('t.release', 'r')
      .where('r.labelId = :labelId', { labelId })
      .andWhere('t.isrc IS NOT NULL')
      .andWhere("t.isrc != ''");

    if (!checkIsSystemTenant(tenantId)) {
      qb.andWhere('r.tenantId = :tenantId', { tenantId });
    }

    const results = await qb.getRawMany<{ isrc: string }>();
    return results.map((r) => r.isrc);
  }

  /**
   * Lấy ISRCs filtered theo releaseId (trong scope tenant)
   */
  async getIsrcsByReleaseId(
    tenantId: string,
    releaseId: string,
  ): Promise<string[]> {
    const qb = this.trackRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.isrc', 'isrc')
      .innerJoin('t.release', 'r')
      .where('r.id = :releaseId', { releaseId })
      .andWhere('t.isrc IS NOT NULL')
      .andWhere("t.isrc != ''");

    if (!checkIsSystemTenant(tenantId)) {
      qb.andWhere('r.tenantId = :tenantId', { tenantId });
    }

    const results = await qb.getRawMany<{ isrc: string }>();
    return results.map((r) => r.isrc);
  }

  /**
   * Resolve ISRCs based on optional filters. Falls back to full tenant scope.
   * Always returns ISRCs from PostgreSQL to ensure data exists in both DBs.
   */
  async resolveIsrcs(
    tenantId: string,
    filters?: { labelId?: string; releaseId?: string },
  ): Promise<string[]> {
    if (filters?.releaseId) {
      return this.getIsrcsByReleaseId(tenantId, filters.releaseId);
    }
    if (filters?.labelId) {
      return this.getIsrcsByLabelId(tenantId, filters.labelId);
    }
    return this.getIsrcsByTenantId(tenantId);
  }

  /**
   * Lấy track metadata cho danh sách ISRCs.
   * Trả về Map<isrc, TrackMetadata> để enrichment.
   * Join: tracks → releases → labels
   */
  async getTrackMetadataMap(
    isrcs: string[],
  ): Promise<Map<string, TrackMetadata>> {
    if (!isrcs.length) return new Map();

    const results = await this.trackRepo
      .createQueryBuilder('t')
      .select([
        't.isrc AS isrc',
        't.title AS "trackTitle"',
        't.version AS "trackVersion"',
        'r.id AS "releaseId"',
        'r.title AS "releaseTitle"',
        'r.upc AS "releaseUpc"',
        'l.id AS "labelId"',
        'l.name AS "labelName"',
      ])
      .innerJoin('t.release', 'r')
      .leftJoin('r.label', 'l')
      .where('t.isrc IN (:...isrcs)', { isrcs })
      .getRawMany<TrackMetadata>();

    const map = new Map<string, TrackMetadata>();
    for (const row of results) {
      map.set(row.isrc, row);
    }
    return map;
  }

  /**
   * Lấy mapping ISRC → Artist(s) cho enrichment.
   * 1 ISRC có thể có nhiều artists (many-to-many qua track_artist).
   * Join: tracks → track_artist → artists
   */
  async getIsrcArtistMappings(
    isrcs: string[],
  ): Promise<IsrcArtistMapping[]> {
    if (!isrcs.length) return [];

    const results = await this.trackRepo
      .createQueryBuilder('t')
      .select([
        't.isrc AS isrc',
        'a.id AS "artistId"',
        'a.name AS "artistName"',
        'a.picture AS "artistPicture"',
      ])
      .innerJoin('t.trackArtists', 'ta')
      .innerJoin('ta.artist', 'a')
      .where('t.isrc IN (:...isrcs)', { isrcs })
      .andWhere('t.isrc IS NOT NULL')
      .getRawMany<IsrcArtistMapping>();

    return results;
  }

  /**
   * Lấy full track metadata cho tenant (bao gồm release, label info).
   * Dùng cho ranking Release/Label khi cần aggregate toàn bộ ISRCs.
   */
  async getAllTrackMetadataForTenant(
    tenantId: string,
    filters?: { labelId?: string },
  ): Promise<TrackMetadata[]> {
    const qb = this.trackRepo
      .createQueryBuilder('t')
      .select([
        't.isrc AS isrc',
        't.title AS "trackTitle"',
        't.version AS "trackVersion"',
        'r.id AS "releaseId"',
        'r.title AS "releaseTitle"',
        'r.upc AS "releaseUpc"',
        'l.id AS "labelId"',
        'l.name AS "labelName"',
      ])
      .innerJoin('t.release', 'r')
      .leftJoin('r.label', 'l')
      .where('t.isrc IS NOT NULL')
      .andWhere("t.isrc != ''");

    if (!checkIsSystemTenant(tenantId)) {
      qb.andWhere('r.tenantId = :tenantId', { tenantId });
    }

    if (filters?.labelId) {
      qb.andWhere('r.labelId = :labelId', { labelId: filters.labelId });
    }

    return qb.getRawMany<TrackMetadata>();
  }

  /**
   * Lấy ISRC → Artist mappings cho toàn bộ tenant.
   * Dùng cho ranking Artist.
   */
  async getAllIsrcArtistMappingsForTenant(
    tenantId: string,
  ): Promise<IsrcArtistMapping[]> {
    const qb = this.trackRepo
      .createQueryBuilder('t')
      .select([
        't.isrc AS isrc',
        'a.id AS "artistId"',
        'a.name AS "artistName"',
        'a.picture AS "artistPicture"',
      ])
      .innerJoin('t.release', 'r')
      .innerJoin('t.trackArtists', 'ta')
      .innerJoin('ta.artist', 'a')
      .where('t.isrc IS NOT NULL')
      .andWhere("t.isrc != ''");

    if (!checkIsSystemTenant(tenantId)) {
      qb.andWhere('r.tenantId = :tenantId', { tenantId });
    }

    const results = await qb.getRawMany<IsrcArtistMapping>();
    return results;
  }
}
