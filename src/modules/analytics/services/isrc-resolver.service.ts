import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { Video } from 'src/modules/video/entities/video.entity';
import { getCoverArtThumbnails } from 'src/utils/util';
import { ILike, In, Repository } from 'typeorm';
import {
	AnalyticsVideoInfo,
	IsrcArtistMapping,
	TrackMetadata,
} from '../interfaces/analytics.interface';

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
		@InjectRepository(Tenant)
		private readonly tenantRepo: Repository<Tenant>,
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
		@InjectRepository(Video)
		private readonly videoRepo: Repository<Video>,
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
	async getIsrcArtistMappings(isrcs: string[]): Promise<IsrcArtistMapping[]> {
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
	 * Lấy ảnh bìa (cover art) dạng thumbnails cho danh sách releaseIds từ PostgreSQL
	 */
	async getReleaseImages(
		releaseIds: string[],
	): Promise<Map<string, ICoverArtThumbnails>> {
		const map = new Map<string, ICoverArtThumbnails>();
		if (!releaseIds.length) return map;
		const releases = await this.releaseRepo.find({
			where: { id: In(releaseIds) },
			relations: ['releaseCoverArts'],
		});

		for (const r of releases) {
			map.set(r.id, getCoverArtThumbnails(r.releaseCoverArts));
		}
		return map;
	}

	/**
	 * Lấy thông tin logo/ảnh đại diện cho danh sách labelIds từ PostgreSQL
	 */
	async getLabelMetadata(labelIds: string[]): Promise<
		Map<
			string,
			{
				name: string;
				picture: string | null;
				tenant: {
					id: string;
					name: string;
					title: string;
					logo: string | null;
				} | null;
			}
		>
	> {
		if (!labelIds.length) return new Map();
		const labels = await this.labelRepo.find({
			where: { id: In(labelIds) },
			relations: ['tenant'],
			select: {
				id: true,
				name: true,
				picture: true,
				tenant: {
					id: true,
					name: true,
					title: true,
					logo: true,
				},
			},
		});

		const map = new Map<
			string,
			{
				name: string;
				picture: string | null;
				tenant: {
					id: string;
					name: string;
					title: string;
					logo: string | null;
				} | null;
			}
		>();
		for (const l of labels) {
			map.set(l.id, {
				name: l.name,
				picture: l.picture, // Tự động định dạng URL qua MediaUrlTransformer
				tenant: l.tenant
					? {
							id: l.tenant.id,
							name: l.tenant.name,
							title: l.tenant.title,
							logo: l.tenant.logo || null,
						}
					: null,
			});
		}
		return map;
	}

	/**
	 * Lấy thông tin (name, thumbnail, youtubeChannelId, tenant) cho danh sách channelIds từ PostgreSQL
	 */
	async getChannelMetadata(channelIds: string[]): Promise<
		Map<
			string,
			{
				name: string;
				thumbUrl: string | null;
				youtubeChannelId: string | null;
				tenant: {
					id: string;
					name: string;
					title: string;
					logo: string | null;
				} | null;
			}
		>
	> {
		const map = new Map<
			string,
			{
				name: string;
				thumbUrl: string | null;
				youtubeChannelId: string | null;
				tenant: {
					id: string;
					name: string;
					title: string;
					logo: string | null;
				} | null;
			}
		>();
		if (!channelIds.length) return map;

		const channels = await this.channelRepo.find({
			where: { id: In(channelIds) },
			relations: ['tenant'],
			select: {
				id: true,
				name: true,
				thumbUrl: true,
				youtubeChannelId: true,
				tenant: {
					id: true,
					name: true,
					title: true,
					logo: true,
				},
			},
		});

		for (const c of channels) {
			map.set(c.id, {
				name: c.name,
				thumbUrl: c.thumbUrl || null,
				youtubeChannelId: c.youtubeChannelId || null,
				tenant: c.tenant
					? {
							id: c.tenant.id,
							name: c.tenant.name,
							title: c.tenant.title,
							logo: c.tenant.logo || null,
						}
					: null,
			});
		}
		return map;
	}

	/**
	 * Lấy thông tin chi tiết cho danh sách artistIds từ PostgreSQL
	 * Bao gồm: name, picture, profiles (Spotify/Apple Music...), country, genre
	 */
	async getArtistMetadata(artistIds: string[]): Promise<
		Map<
			string,
			{
				name: string;
				picture: string | null;
				profiles: Array<{
					dspCode: string;
					dspName: string;
					url: string;
				}>;
				country: string | null;
				genre: string | null;
			}
		>
	> {
		if (!artistIds.length) return new Map();
		const artists = await this.artistRepo.find({
			where: { id: In(artistIds) },
			relations: [
				'artistProfiles',
				'artistProfiles.dsp',
				'country',
				'genre',
			],
		});

		const map = new Map<
			string,
			{
				name: string;
				picture: string | null;
				profiles: Array<{
					dspCode: string;
					dspName: string;
					url: string;
				}>;
				country: string | null;
				genre: string | null;
			}
		>();
		const domain = process.env.R2_PUBLIC_BASE_URL || 'default.com';
		for (const a of artists) {
			let pictureUrl: string | null = null;
			if (a.picture) {
				pictureUrl = a.picture.startsWith('http')
					? a.picture
					: `${domain}/${a.picture}`;
			}

			const profiles = (a.artistProfiles ?? [])
				.filter((p) => p.url)
				.map((p) => ({
					dspCode: p.dsp?.code ?? '',
					dspName: p.dsp?.name ?? '',
					url: p.url,
				}));

			map.set(a.id, {
				name: a.name,
				picture: pictureUrl,
				profiles,
				country: a.country?.name ?? a.originCountry ?? null,
				genre: a.genre?.name ?? a.primaryGenre ?? null,
			});
		}
		return map;
	}

	/**
	 * Lấy thông tin logo/ảnh đại diện cho danh sách tenantIds từ PostgreSQL
	 */
	async getTenantMetadata(
		tenantIds: string[],
	): Promise<
		Map<
			string,
			{ name: string; title: string; logo: string | null; type: string | null }
		>
	> {
		if (!tenantIds.length) return new Map();
		const tenants = await this.tenantRepo.find({
			where: { id: In(tenantIds) },
			select: ['id', 'name', 'title', 'logo', 'type'],
		});

		const map = new Map<
			string,
			{ name: string; title: string; logo: string | null; type: string | null }
		>();
		for (const t of tenants) {
			map.set(t.id, {
				name: t.name,
				title: t.title || t.name,
				logo: t.logo || null,
				type: t.type ?? null,
			});
		}
		return map;
	}

	/**
	 * Lấy thông tin chi tiết cho danh sách releaseIds từ PostgreSQL (cho Top Releases)
	 */
	async getReleaseMetadata(releaseIds: string[]): Promise<
		Map<
			string,
			{
				title: string;
				upc: string | null;
				labelId: string | null;
				labelName: string | null;
				trackCount: number;
				coverArtThumbnails: ICoverArtThumbnails;
			}
		>
	> {
		const map = new Map<string, any>();
		if (!releaseIds.length) return map;

		const releases = await this.releaseRepo.find({
			where: { id: In(releaseIds) },
			relations: ['label', 'tracks', 'releaseCoverArts'],
		});

		for (const r of releases) {
			map.set(r.id, {
				title: r.title,
				upc: r.upc,
				labelId: r.labelId,
				labelName: r.label?.name || null,
				trackCount: r.tracks?.length ?? 0,
				coverArtThumbnails: getCoverArtThumbnails(r.releaseCoverArts),
			});
		}
		return map;
	}

	// ─────────────────────────────────────────────────────
	// Keyword search — HARD CAP 1000 rows để tránh keyword phổ biến (vd "a",
	// "the") match hàng chục nghìn row → array UUID kéo về Node → làm param
	// `IN(...)` khổng lồ cho ClickHouse → double RAM hit. Đây là defense-in-depth
	// ngăn OOM khi client gõ keyword ngắn.
	// ─────────────────────────────────────────────────────
	async getVideoMetadataByReleaseIds(
		releaseIds: string[],
	): Promise<Map<string, AnalyticsVideoInfo>> {
		const map = new Map<string, AnalyticsVideoInfo>();
		if (!releaseIds.length) return map;

		const videos = await this.videoRepo.find({
			where: { releaseId: In(releaseIds) },
			select: {
				id: true,
				releaseId: true,
				isrc: true,
				externalId: true,
				label: true,
				explicit: true,
				aiContent: true,
				channelId: true,
				description: true,
				keywords: true,
				madeForKids: true,
				visibility: true,
				contentProvider: true,
				copyrightOwner: true,
				partnerCustomId1: true,
				partnerCustomId2: true,
				fileId: true,
				youtubeMatchStatus: true,
				youtubeMatchScannedAt: true,
			},
		});

		for (const video of videos) {
			map.set(video.releaseId, {
				id: video.id,
				releaseId: video.releaseId,
				isrc: video.isrc,
				externalId: video.externalId,
				label: video.label,
				explicit: video.explicit,
				aiContent: video.aiContent,
				channelId: video.channelId,
				description: video.description,
				keywords: video.keywords,
				madeForKids: video.madeForKids,
				visibility: video.visibility,
				contentProvider: video.contentProvider,
				copyrightOwner: video.copyrightOwner,
				partnerCustomId1: video.partnerCustomId1,
				partnerCustomId2: video.partnerCustomId2,
				fileId: video.fileId,
				youtubeMatchStatus: video.youtubeMatchStatus,
				youtubeMatchScannedAt: video.youtubeMatchScannedAt,
			});
		}
		return map;
	}

	private static readonly KEYWORD_SEARCH_LIMIT = 1000;

	private warnIfHitCeiling(
		scope: string,
		keyword: string,
		count: number,
	): void {
		if (count >= IsrcResolverService.KEYWORD_SEARCH_LIMIT) {
			this.logger.warn(
				`Keyword search "${scope}" hit ceiling ${IsrcResolverService.KEYWORD_SEARCH_LIMIT} for keyword="${keyword}". Kết quả bị cắt — user cần refine query.`,
			);
		}
	}

	async getArtistIdsByKeyword(keyword: string): Promise<string[]> {
		const artists = await this.artistRepo.find({
			where: { name: ILike(`%${keyword}%`) },
			select: ['id'],
			take: IsrcResolverService.KEYWORD_SEARCH_LIMIT,
		});
		this.warnIfHitCeiling('artists', keyword, artists.length);
		return artists.map((a) => a.id);
	}

	async getLabelIdsByKeyword(keyword: string): Promise<string[]> {
		const labels = await this.labelRepo.find({
			where: { name: ILike(`%${keyword}%`) },
			select: ['id'],
			take: IsrcResolverService.KEYWORD_SEARCH_LIMIT,
		});
		this.warnIfHitCeiling('labels', keyword, labels.length);
		return labels.map((l) => l.id);
	}

	async getTenantIdsByKeyword(keyword: string): Promise<string[]> {
		const tenants = await this.tenantRepo.find({
			where: [
				{ name: ILike(`%${keyword}%`) },
				{ title: ILike(`%${keyword}%`) },
			],
			select: ['id'],
			take: IsrcResolverService.KEYWORD_SEARCH_LIMIT,
		});
		this.warnIfHitCeiling('tenants', keyword, tenants.length);
		return tenants.map((t) => t.id);
	}

	async getReleaseIdsByKeyword(keyword: string): Promise<string[]> {
		const releases = await this.releaseRepo.find({
			where: { title: ILike(`%${keyword}%`) },
			select: ['id'],
			take: IsrcResolverService.KEYWORD_SEARCH_LIMIT,
		});
		this.warnIfHitCeiling('releases', keyword, releases.length);
		return releases.map((r) => r.id);
	}

	async getIsrcsByTrackTitleKeyword(keyword: string): Promise<string[]> {
		const tracks = await this.trackRepo.find({
			where: { title: ILike(`%${keyword}%`) },
			select: ['isrc'],
			take: IsrcResolverService.KEYWORD_SEARCH_LIMIT,
		});
		this.warnIfHitCeiling('tracks', keyword, tracks.length);
		return tracks
			.map((t) => t.isrc)
			.filter((isrc): isrc is string => !!isrc);
	}
}
