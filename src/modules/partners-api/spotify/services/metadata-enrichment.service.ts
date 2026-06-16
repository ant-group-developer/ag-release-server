import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { DataSource, ILike } from 'typeorm';
import { SpotifyService } from './spotify.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseEnrichment, ReleaseEnrichmentStatus } from 'src/modules/release/entities/release-enrichment.entity';
import { Track } from 'src/modules/track/entities/track.entity';

/**
 * Enriched metadata returned from Spotify or Deezer APIs for a given ISRC.
 */
export interface EnrichedMetadata {
	/** Source of the metadata: 'spotify', 'deezer', or 'local' (from existing DB data) */
	source: 'spotify' | 'deezer' | 'local';

	// ─── Track-Level ─────────────────────────────────────
	isrc: string;
	trackTitle: string;
	trackSpotifyId?: string;
	trackDuration?: number; // ms

	// ─── Artist-Level ────────────────────────────────────
	artistName: string;
	artistSpotifyId?: string;
	artistSpotifyUrl?: string;
	artistDeezerId?: string;
	artistDeezerUrl?: string;
	artistPicture?: string;

	// ─── Album / Release-Level ───────────────────────────
	upc: string;
	albumTitle: string;
	albumSpotifyId?: string;
	albumDeezerId?: string;
	releaseDate?: string; // 'YYYY-MM-DD'
	albumType?: string; // 'album' | 'single' | 'compilation'
	totalTracks?: number;
	albumCoverUrl?: string;

	// ─── Label & Copyright ───────────────────────────────
	labelName?: string;
	copyrights?: Array<{ text: string; type: string }>;
	genres?: string[];

	// ─── Track List ──────────────────────────────────────
	tracks?: Array<{
		isrc: string;
		title: string;
		duration?: number;
		trackNumber?: number;
		spotifyId?: string;
		deezerId?: string;
	}>;
}

interface EnrichmentLookupOptions {
	forceExternal?: boolean;
}

const sleepHelper = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestWithRetry<T>(
	fn: () => Promise<T>,
	logger: Logger,
	retries = 5,
	delayMs = 1000,
): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		const axiosError = err as AxiosError;
		if (axiosError.response?.status === 429) {
			if (retries <= 0) throw err;
			const retryAfterHeader = axiosError.response.headers?.['retry-after'];
			const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader as string, 10) : 0;
			const waitTime = retryAfterSec > 0 ? (retryAfterSec * 1000 + 500) : delayMs;

			logger.warn(`[Spotify API] 429 Too Many Requests. Retrying after ${waitTime}ms (remaining retries: ${retries})...`);
			await sleepHelper(waitTime);
			return requestWithRetry(fn, logger, retries - 1, delayMs * 2);
		}

		if (retries > 0 && (!axiosError.response || axiosError.response.status >= 500)) {
			logger.warn(`[Spotify API] Request failed (${axiosError.response?.status || 'network error'}). Retrying in ${delayMs}ms...`);
			await sleepHelper(delayMs);
			return requestWithRetry(fn, logger, retries - 1, delayMs * 2);
		}

		throw err;
	}
}

@Injectable()
export class MetadataEnrichmentService {
	private readonly logger = new Logger(MetadataEnrichmentService.name);


	constructor(
		private readonly spotifyService: SpotifyService,
		private readonly dataSource: DataSource,
	) {}

	// ─────────────────────────────────────────────────────
	// PUBLIC API
	// ─────────────────────────────────────────────────────

	async enrichByIsrc(
		isrc: string,
		options?: EnrichmentLookupOptions,
	): Promise<EnrichedMetadata | null> {
		if (!isrc?.trim()) return null;
		const normalizedIsrc = isrc.trim().toUpperCase();

		// ─── Local-first: check if ISRC already exists in DB ───
		if (!options?.forceExternal) {
			const localResult = await this.findLocalByIsrc(normalizedIsrc);
			if (localResult) {
				this.logger.log(`[Local Cache] Found enriched ISRC ${normalizedIsrc} in local DB, skipping external API call`);
				return localResult;
			}
		}

		// Call both Spotify and Deezer APIs in parallel
		const [spotifyResult, deezerResult] = await Promise.all([
			this.enrichFromSpotify(normalizedIsrc).catch((err) => {
				this.logger.warn(
					`Spotify lookup failed for ISRC ${normalizedIsrc}: ${err.message}`,
				);
				return null;
			}),
			this.enrichFromDeezer(normalizedIsrc).catch((err) => {
				this.logger.warn(
					`Deezer lookup failed for ISRC ${normalizedIsrc}: ${err.message}`,
				);
				return null;
			}),
		]);

		// Prioritize Spotify first, then fall back to Deezer
		if (spotifyResult) {
			return spotifyResult;
		}
		if (deezerResult) {
			return deezerResult;
		}

		return null;
	}

	async enrichByUpc(
		upc: string,
		options?: EnrichmentLookupOptions,
	): Promise<EnrichedMetadata | null> {
		if (!upc?.trim()) return null;
		const normalizedUpc = upc.trim();

		// ─── Local-first: check if UPC already exists in DB ───
		if (!options?.forceExternal) {
			const localResult = await this.findLocalByUpc(normalizedUpc);
			if (localResult) {
				this.logger.log(`[Local Cache] Found enriched UPC ${normalizedUpc} in local DB, skipping external API call`);
				return localResult;
			}
		}

		// Call both Spotify and Deezer APIs in parallel
		const [spotifyResult, deezerResult] = await Promise.all([
			this.enrichFromSpotifyByUpc(normalizedUpc).catch((err) => {
				this.logger.warn(
					`Spotify UPC lookup failed for UPC ${normalizedUpc}: ${err.message}`,
				);
				return null;
			}),
			this.enrichFromDeezerByUpc(normalizedUpc).catch((err) => {
				this.logger.warn(
					`Deezer UPC lookup failed for UPC ${normalizedUpc}: ${err.message}`,
				);
				return null;
			}),
		]);

		if (spotifyResult) {
			return spotifyResult;
		}
		if (deezerResult) {
			return deezerResult;
		}

		return null;
	}

	private async enrichFromSpotifyByUpc(upc: string): Promise<EnrichedMetadata | null> {
		const token = await this.spotifyService.getCacheToken();

		// Step 1: Search album by UPC
		const searchRes = await this.spotifyService.enqueue(() =>
			requestWithRetry(() => axios.get(
				'https://api.spotify.com/v1/search',
				{
					params: { type: 'album', q: `upc:${upc}` },
					headers: { Authorization: `Bearer ${token}` },
					timeout: 15000,
				},
			), this.logger)
		);

		const items = searchRes.data?.albums?.items;
		if (!items || items.length === 0) return null;

		const album = items[0];

		// Step 2: Fetch full album details
		let albumDetail: any = null;
		if (album?.id) {
			try {
				const albumRes = await this.spotifyService.enqueue(() =>
					requestWithRetry(() => axios.get(
						`https://api.spotify.com/v1/albums/${album.id}`,
						{
							headers: { Authorization: `Bearer ${token}` },
							timeout: 15000,
						},
					), this.logger)
				);
				albumDetail = albumRes.data;
			} catch (err) {
				this.logger.warn(
					`Spotify album detail fetch failed for ${album.id}: ${err.message}`,
				);
				return null;
			}
		}

		if (!albumDetail) return null;

		const artist = albumDetail.artists?.[0];
		const trackItems = albumDetail.tracks?.items || [];
		const trackIds = trackItems.map((t: any) => t.id).filter(Boolean);

		// Step 3: Fetch full track details to get ISRCs
		const tracksWithIsrc: any[] = [];
		if (trackIds.length > 0) {
			try {
				const chunks = [];
				for (let i = 0; i < trackIds.length; i += 50) {
					chunks.push(trackIds.slice(i, i + 50));
				}

				for (const chunk of chunks) {
					const tracksRes = await this.spotifyService.enqueue(() =>
						requestWithRetry(() => axios.get(
							'https://api.spotify.com/v1/tracks',
							{
								params: { ids: chunk.join(',') },
								headers: { Authorization: `Bearer ${token}` },
								timeout: 15000,
							},
						), this.logger)
					);
					if (tracksRes.data?.tracks) {
						tracksWithIsrc.push(...tracksRes.data.tracks);
					}
				}
			} catch (err) {
				this.logger.warn(
					`Spotify tracks detail fetch failed for album ${album.id}: ${err.message}`,
				);
			}
		}

		const primaryIsrc = tracksWithIsrc[0]?.external_ids?.isrc || '';

		return {
			source: 'spotify',
			isrc: primaryIsrc,

			// Track
			trackTitle: tracksWithIsrc[0]?.name || '',
			trackSpotifyId: tracksWithIsrc[0]?.id,
			trackDuration: tracksWithIsrc[0]?.duration_ms,

			// Artist
			artistName: artist?.name || '',
			artistSpotifyId: artist?.id,
			artistSpotifyUrl: artist?.external_urls?.spotify,

			// Album
			upc,
			albumTitle: albumDetail.name || '',
			albumSpotifyId: albumDetail.id,
			releaseDate: albumDetail.release_date,
			albumType: albumDetail.album_type,
			totalTracks: albumDetail.total_tracks,
			albumCoverUrl: albumDetail.images?.[0]?.url,

			// Label & Copyright
			labelName: albumDetail.label,
			copyrights: albumDetail.copyrights?.map((c: any) => ({
				text: c.text,
				type: c.type,
			})),
			genres: albumDetail.genres,

			// Track list
			tracks: tracksWithIsrc.map((t) => ({
				isrc: t.external_ids?.isrc || '',
				title: t.name || '',
				duration: t.duration_ms,
				trackNumber: t.track_number,
				spotifyId: t.id,
			})),
		};
	}

	private async enrichFromDeezerByUpc(upc: string): Promise<EnrichedMetadata | null> {
		// Step 1: Fetch full album details by UPC
		const albumRes = await axios.get(
			`https://api.deezer.com/album/upc:${upc}`,
			{ timeout: 15000 },
		);

		const albumDetail = albumRes.data;
		if (!albumDetail || albumDetail.error) return null;

		const artist = albumDetail.artist;

		// Step 2: Fetch ALL tracks (Deezer paginates at 25 per page)
		const allTrackItems = await this.fetchAllDeezerAlbumTracks(albumDetail);

		// Step 3: Fetch full track details (with ISRC) in chunks
		const tracksWithIsrc = await this.fetchDeezerTrackDetails(allTrackItems);

		const primaryIsrc = tracksWithIsrc[0]?.isrc || '';

		return {
			source: 'deezer',
			isrc: primaryIsrc,

			// Track
			trackTitle: tracksWithIsrc[0]?.title_short || tracksWithIsrc[0]?.title || '',
			trackDuration: tracksWithIsrc[0]?.duration ? tracksWithIsrc[0]?.duration * 1000 : undefined,

			// Artist
			artistName: artist?.name || '',
			artistDeezerId: artist?.id?.toString(),
			artistDeezerUrl: artist?.link,
			artistPicture: artist?.picture_big || artist?.picture_medium,

			// Album
			upc,
			albumTitle: albumDetail.title || '',
			albumDeezerId: albumDetail.id?.toString(),
			releaseDate: albumDetail.release_date,
			albumType: albumDetail.record_type,
			totalTracks: albumDetail.nb_tracks,
			albumCoverUrl: albumDetail.cover_big || albumDetail.cover_xl,

			// Label & Copyright
			labelName: albumDetail.label,
			copyrights: albumDetail.copyrights || undefined,
			genres: albumDetail.genres?.data?.map((g: any) => g.name).filter(Boolean) || [],

			// Track list
			tracks: tracksWithIsrc.map((t) => ({
				isrc: t.isrc || '',
				title: t.title_short || t.title || '',
				duration: t.duration ? t.duration * 1000 : undefined,
				trackNumber: t.track_position,
				deezerId: t.id?.toString(),
			})),
		};
	}

	/**
	 * Batch-enrich a list of ISRCs. Returns a Map<isrc, EnrichedMetadata>.
	 * Throttles requests to respect API rate limits.
	 */
	async enrichBatch(
		isrcs: string[],
		options?: { concurrency?: number; delayMs?: number; forceExternal?: boolean },
	): Promise<Map<string, EnrichedMetadata>> {
		const concurrency = options?.concurrency ?? 3;
		const delayMs = options?.delayMs ?? 200;
		const results = new Map<string, EnrichedMetadata>();
		const unique = [...new Set(isrcs.map((i) => i.trim().toUpperCase()).filter(Boolean))];
		const batchCache = new Map<string, EnrichedMetadata>();

		this.logger.log(`Enriching ${unique.length} unique ISRCs (concurrency=${concurrency})...`);

		// Process in sliding-window batches
		for (let i = 0; i < unique.length; i += concurrency) {
			const batch = unique.slice(i, i + concurrency);
			const promises = batch.map(async (isrc) => {
				const cached = batchCache.get(isrc);
				if (cached) {
					results.set(isrc, cached);
					this.logger.log(`[Batch Cache] Found ISRC ${isrc} in current enrichment batch, skipping external API call`);
					return;
				}

				try {
					const meta = await this.enrichByIsrc(isrc, {
						forceExternal: options?.forceExternal,
					});
					if (meta) {
						this.cacheBatchMetadata(batchCache, isrc, meta);
						results.set(isrc, batchCache.get(isrc) ?? this.buildMetadataForIsrc(meta, isrc));
					}
				} catch (err) {
					this.logger.warn(`Failed to enrich ISRC ${isrc}: ${err.message}`);
				}
			});

			await Promise.all(promises);

			for (const isrc of batch) {
				if (!results.has(isrc)) {
					const cached = batchCache.get(isrc);
					if (cached) {
						results.set(isrc, cached);
					}
				}
			}

			// Log progress periodically (every 50 batches / 150 ISRCs)
			const processedCount = i + batch.length;
			if (processedCount % 150 === 0 || processedCount === unique.length) {
				const percentage = ((processedCount / unique.length) * 100).toFixed(1);
				this.logger.log(
					`[Progress] Enriched ${processedCount}/${unique.length} ISRCs (${percentage}% completed)...`,
				);
			}

			// Throttle between batches
			if (i + concurrency < unique.length) {
				await this.sleep(delayMs);
			}
		}

		this.logger.log(`Enrichment complete: ${results.size}/${unique.length} ISRCs resolved.`);
		return results;
	}

	// ─────────────────────────────────────────────────────
	// SPOTIFY
	// ─────────────────────────────────────────────────────

	private cacheBatchMetadata(
		cache: Map<string, EnrichedMetadata>,
		lookupIsrc: string,
		meta: EnrichedMetadata,
	): void {
		const normalizedLookup = this.normalizeIsrc(lookupIsrc);
		if (normalizedLookup) {
			cache.set(normalizedLookup, this.buildMetadataForIsrc(meta, normalizedLookup));
		}

		const primaryIsrc = this.normalizeIsrc(meta.isrc);
		if (primaryIsrc) {
			cache.set(primaryIsrc, this.buildMetadataForIsrc(meta, primaryIsrc));
		}

		for (const track of meta.tracks ?? []) {
			const trackIsrc = this.normalizeIsrc(track.isrc);
			if (!trackIsrc) continue;
			cache.set(trackIsrc, this.buildMetadataForIsrc(meta, trackIsrc));
		}
	}

	private buildMetadataForIsrc(meta: EnrichedMetadata, isrc: string): EnrichedMetadata {
		const normalizedIsrc = this.normalizeIsrc(isrc);
		const matchedTrack = (meta.tracks ?? []).find(
			(track) => this.normalizeIsrc(track.isrc) === normalizedIsrc,
		);

		if (!matchedTrack) {
			return {
				...meta,
				isrc: normalizedIsrc || meta.isrc,
			};
		}

		return {
			...meta,
			isrc: matchedTrack.isrc,
			trackTitle: matchedTrack.title || meta.trackTitle,
			trackSpotifyId: matchedTrack.spotifyId || meta.trackSpotifyId,
			trackDuration: matchedTrack.duration ?? meta.trackDuration,
		};
	}

	private normalizeIsrc(isrc?: string): string {
		return isrc?.trim().toUpperCase() || '';
	}

	private async enrichFromSpotify(isrc: string): Promise<EnrichedMetadata | null> {
		const token = await this.spotifyService.getCacheToken();

		// Step 1: Search track by ISRC
		const searchRes = await this.spotifyService.enqueue(() =>
			requestWithRetry(() => axios.get(
				'https://api.spotify.com/v1/search',
				{
					params: { type: 'track', q: `isrc:${isrc}` },
					headers: { Authorization: `Bearer ${token}` },
					timeout: 15000,
				},
			), this.logger)
		);

		const items = searchRes.data?.tracks?.items;
		if (!items || items.length === 0) return null;

		const track = items[0];
		const album = track.album;
		const artist = track.artists?.[0];

		// Step 2: Fetch full album details (to get UPC, label, copyrights)
		let albumDetail: any = null;
		if (album?.id) {
			try {
				const albumRes = await this.spotifyService.enqueue(() =>
					requestWithRetry(() => axios.get(
						`https://api.spotify.com/v1/albums/${album.id}`,
						{
							headers: { Authorization: `Bearer ${token}` },
							timeout: 15000,
						},
					), this.logger)
				);
				albumDetail = albumRes.data;
			} catch (err) {
				this.logger.warn(
					`Spotify album detail fetch failed for ${album.id}: ${err.message}`,
				);
			}
		}

		const upc = albumDetail?.external_ids?.upc || '';

		// Step 3: Fetch full track details to get ISRCs
		const tracksWithIsrc: any[] = [];
		const trackItems = albumDetail?.tracks?.items || [];
		const trackIds = trackItems.map((t: any) => t.id).filter(Boolean);
		if (trackIds.length > 0) {
			try {
				const chunks = [];
				for (let i = 0; i < trackIds.length; i += 50) {
					chunks.push(trackIds.slice(i, i + 50));
				}

				for (const chunk of chunks) {
					const tracksRes = await this.spotifyService.enqueue(() =>
						requestWithRetry(() => axios.get(
							'https://api.spotify.com/v1/tracks',
							{
								params: { ids: chunk.join(',') },
								headers: { Authorization: `Bearer ${token}` },
								timeout: 15000,
							},
						), this.logger)
					);
					if (tracksRes.data?.tracks) {
						tracksWithIsrc.push(...tracksRes.data.tracks);
					}
				}
			} catch (err) {
				this.logger.warn(
					`Spotify tracks detail fetch failed for album ${album.id}: ${err.message}`,
				);
			}
		}

		return {
			source: 'spotify',
			isrc,

			// Track
			trackTitle: track.name || '',
			trackSpotifyId: track.id,
			trackDuration: track.duration_ms,

			// Artist
			artistName: artist?.name || '',
			artistSpotifyId: artist?.id,
			artistSpotifyUrl: artist?.external_urls?.spotify,

			// Album
			upc,
			albumTitle: albumDetail?.name || album?.name || '',
			albumSpotifyId: album?.id,
			releaseDate: albumDetail?.release_date || album?.release_date,
			albumType: albumDetail?.album_type || album?.album_type,
			totalTracks: albumDetail?.total_tracks || album?.total_tracks,
			albumCoverUrl: (albumDetail?.images || album?.images)?.[0]?.url,

			// Label & Copyright
			labelName: albumDetail?.label,
			copyrights: albumDetail?.copyrights?.map((c: any) => ({
				text: c.text,
				type: c.type,
			})),
			genres: albumDetail?.genres,

			// Track list
			tracks: tracksWithIsrc.map((t) => ({
				isrc: t.external_ids?.isrc || '',
				title: t.name || '',
				duration: t.duration_ms,
				trackNumber: t.track_number,
				spotifyId: t.id,
			})),
		};
	}

	// ─────────────────────────────────────────────────────
	// DEEZER (public API — no auth needed)
	// ─────────────────────────────────────────────────────

	private async enrichFromDeezer(isrc: string): Promise<EnrichedMetadata | null> {
		// Step 1: Search track by ISRC
		const trackRes = await axios.get(
			`https://api.deezer.com/track/isrc:${isrc}`,
			{ timeout: 15000 },
		);

		const trackData = trackRes.data;
		if (!trackData || trackData.error) return null;

		const artist = trackData.artist;
		const albumRef = trackData.album;

		// Step 2: Fetch full album details (to get UPC, label, genres)
		let albumDetail: any = null;
		if (albumRef?.id) {
			try {
				// Deezer album cover URL ends with /image — strip it to get the album API URL
				const albumUrl = `https://api.deezer.com/album/${albumRef.id}`;
				const albumRes = await axios.get(albumUrl, { timeout: 15000 });
				albumDetail = albumRes.data;
			} catch (err) {
				this.logger.warn(
					`Deezer album detail fetch failed for ${albumRef.id}: ${err.message}`,
				);
			}
		}

		const upc = albumDetail?.upc || '';

		// Fetch ALL tracks (Deezer paginates at 25 per page)
		const allTrackItems = albumDetail ? await this.fetchAllDeezerAlbumTracks(albumDetail) : [];

		// Fetch full track details (with ISRC) in chunks
		const tracksWithIsrc = await this.fetchDeezerTrackDetails(allTrackItems);

		// Extract genres from album detail
		const genres = albumDetail?.genres?.data?.map((g: any) => g.name).filter(Boolean) || [];

		return {
			source: 'deezer',
			isrc,

			// Track
			trackTitle: trackData.title_short || trackData.title || '',
			trackDuration: trackData.duration ? trackData.duration * 1000 : undefined, // Deezer returns seconds

			// Artist
			artistName: artist?.name || '',
			artistDeezerId: artist?.id?.toString(),
			artistDeezerUrl: artist?.link,
			artistPicture: artist?.picture_big || artist?.picture_medium,

			// Album
			upc,
			albumTitle: albumDetail?.title || albumRef?.title || '',
			albumDeezerId: albumRef?.id?.toString(),
			releaseDate: albumDetail?.release_date || trackData.release_date,
			albumType: albumDetail?.record_type,
			totalTracks: albumDetail?.nb_tracks,
			albumCoverUrl: albumRef?.cover_big || albumRef?.cover_xl,

			// Label & Copyright
			labelName: albumDetail?.label,
			copyrights: albumDetail?.copyrights || undefined,
			genres,

			// Track list
			tracks: tracksWithIsrc.map((t) => ({
				isrc: t.isrc || '',
				title: t.title_short || t.title || '',
				duration: t.duration ? t.duration * 1000 : undefined,
				trackNumber: t.track_position,
				deezerId: t.id?.toString(),
			})),
		};
	}

	// ─────────────────────────────────────────────────────
	// UTILS
	// ─────────────────────────────────────────────────────

	/**
	 * Deezer album API paginates tracks at 25 per page.
	 * This helper follows `tracks.next` to collect ALL track items.
	 */
	private async fetchAllDeezerAlbumTracks(albumDetail: any): Promise<any[]> {
		const allTracks: any[] = [...(albumDetail.tracks?.data || [])];
		let nextUrl: string | undefined = albumDetail.tracks?.next;

		while (nextUrl) {
			try {
				const res = await axios.get(nextUrl, { timeout: 15000 });
				if (res.data?.data) {
					allTracks.push(...res.data.data);
				}
				nextUrl = res.data?.next;
			} catch (err) {
				this.logger.warn(`Deezer album tracks pagination failed: ${err.message}`);
				break;
			}
		}

		return allTracks;
	}

	/**
	 * Fetch full track details (with ISRC) from Deezer for a list of track items.
	 * Processes in chunks of 10 with a 300ms delay between chunks to avoid rate limiting.
	 */
	private async fetchDeezerTrackDetails(trackItems: any[]): Promise<any[]> {
		const tracksWithIsrc: any[] = [];
		const chunkSize = 10;

		for (let i = 0; i < trackItems.length; i += chunkSize) {
			const chunk = trackItems.slice(i, i + chunkSize);
			const promises = chunk.map(async (t: any) => {
				try {
					const tRes = await axios.get(`https://api.deezer.com/track/${t.id}`, { timeout: 15000 });
					if (tRes.data && !tRes.data.error) {
						tracksWithIsrc.push(tRes.data);
					}
				} catch (err) {
					this.logger.warn(`Deezer track detail fetch failed for track ${t.id}: ${err.message}`);
				}
			});
			await Promise.all(promises);

			// Delay between chunks to respect Deezer rate limits
			if (i + chunkSize < trackItems.length) {
				await this.sleep(300);
			}
		}

		tracksWithIsrc.sort((a, b) => (a.track_position || 0) - (b.track_position || 0));
		return tracksWithIsrc;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// ─────────────────────────────────────────────────────
	// LOCAL DB LOOKUP (cache-first)
	// ─────────────────────────────────────────────────────

	/**
	 * Check if a track with this ISRC already exists in the local DB.
	 * If found, construct EnrichedMetadata from the release + tracks data.
	 */
	private async findLocalByIsrc(isrc: string): Promise<EnrichedMetadata | null> {
		try {
			const trackRepo = this.dataSource.getRepository(Track);
			const track = await trackRepo.findOne({
				where: { isrc: ILike(isrc) },
				relations: ['release', 'release.releaseArtists', 'release.releaseArtists.artist', 'release.label', 'release.tracks'],
			});

			if (!track?.release) return null;

			const release = track.release;

			// Only use local data if it has a real UPC/EAN, not a report/internal code.
			if (!this.isValidStandardUpc(release.upc)) {
				return null;
			}
			if (!(await this.hasSuccessfulEnrichment(release.id))) {
				return null;
			}

			return this.buildLocalEnrichedMetadata(release, isrc);
		} catch (err) {
			this.logger.warn(`[Local Cache] Failed to query local DB for ISRC ${isrc}: ${err.message}`);
			return null;
		}
	}

	/**
	 * Check if a release with this UPC already exists in the local DB.
	 * If found, construct EnrichedMetadata from the release data.
	 */
	private async findLocalByUpc(upc: string): Promise<EnrichedMetadata | null> {
		try {
			const releaseRepo = this.dataSource.getRepository(Release);
			const release = await releaseRepo.findOne({
				where: { upc: ILike(upc) },
				relations: ['releaseArtists', 'releaseArtists.artist', 'label', 'tracks'],
			});

			if (!release) return null;

			// Only use local data if UPC is a real UPC/EAN and title is present.
			if (!this.isValidStandardUpc(release.upc) || !release.title?.trim()) {
				return null;
			}
			if (!(await this.hasSuccessfulEnrichment(release.id))) {
				return null;
			}

			const primaryIsrc = (release.tracks || [])
				.filter(t => t.isrc && !t.isrc.trim().toUpperCase().startsWith('UPC-'))
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.isrc || '';

			return this.buildLocalEnrichedMetadata(release, primaryIsrc);
		} catch (err) {
			this.logger.warn(`[Local Cache] Failed to query local DB for UPC ${upc}: ${err.message}`);
			return null;
		}
	}

	/**
	 * Build EnrichedMetadata from a local Release entity.
	 */
	private buildLocalEnrichedMetadata(release: Release, primaryIsrc: string): EnrichedMetadata {
		const primaryArtist = (release.releaseArtists || [])
			.find(ra => ra.artist)?.artist;

		const tracks = (release.tracks || [])
			.filter(t => t.isrc && !t.isrc.trim().toUpperCase().startsWith('UPC-'))
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map(t => ({
				isrc: t.isrc!,
				title: t.title || '',
				trackNumber: t.order,
			}));

		return {
			source: 'local',
			isrc: primaryIsrc,
			trackTitle: tracks[0]?.title || '',
			artistName: primaryArtist?.name || '',
			upc: release.upc || '',
			albumTitle: release.title || '',
			releaseDate: release.releaseDate ? new Date(release.releaseDate).toISOString().slice(0, 10) : undefined,
			totalTracks: tracks.length || undefined,
			labelName: release.label?.name,
			tracks,
		};
	}

	private isValidStandardUpc(upc?: string | null): boolean {
		const normalized = upc?.trim() || '';
		return /^\d{10,14}$/.test(normalized);
	}

	private async hasSuccessfulEnrichment(releaseId: string): Promise<boolean> {
		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);
		return enrichmentRepo.exists({
			where: {
				releaseId,
				status: ReleaseEnrichmentStatus.SUCCESS,
			},
		});
	}
}
