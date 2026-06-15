import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { SpotifyService } from './spotify.service';

/**
 * Enriched metadata returned from Spotify or Deezer APIs for a given ISRC.
 */
export interface EnrichedMetadata {
	/** Source of the metadata: 'spotify' or 'deezer' */
	source: 'spotify' | 'deezer';

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

@Injectable()
export class MetadataEnrichmentService {
	private readonly logger = new Logger(MetadataEnrichmentService.name);

	constructor(private readonly spotifyService: SpotifyService) {}

	// ─────────────────────────────────────────────────────
	// PUBLIC API
	// ─────────────────────────────────────────────────────

	async enrichByIsrc(isrc: string): Promise<EnrichedMetadata | null> {
		if (!isrc?.trim()) return null;
		const normalizedIsrc = isrc.trim().toUpperCase();

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

	async enrichByUpc(upc: string): Promise<EnrichedMetadata | null> {
		if (!upc?.trim()) return null;
		const normalizedUpc = upc.trim();

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
		const searchRes = await axios.get(
			'https://api.spotify.com/v1/search',
			{
				params: { type: 'album', q: `upc:${upc}` },
				headers: { Authorization: `Bearer ${token}` },
				timeout: 15000,
			},
		);

		const items = searchRes.data?.albums?.items;
		if (!items || items.length === 0) return null;

		const album = items[0];

		// Step 2: Fetch full album details
		let albumDetail: any = null;
		if (album?.id) {
			try {
				const albumRes = await axios.get(
					`https://api.spotify.com/v1/albums/${album.id}`,
					{
						headers: { Authorization: `Bearer ${token}` },
						timeout: 15000,
					},
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
					const tracksRes = await axios.get(
						'https://api.spotify.com/v1/tracks',
						{
							params: { ids: chunk.join(',') },
							headers: { Authorization: `Bearer ${token}` },
							timeout: 15000,
						},
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
		const trackItems = albumDetail.tracks?.data || [];

		const tracksWithIsrc: any[] = [];
		const trackPromises = trackItems.slice(0, 50).map(async (t: any) => {
			try {
				const tRes = await axios.get(`https://api.deezer.com/track/${t.id}`, { timeout: 15000 });
				if (tRes.data && !tRes.data.error) {
					tracksWithIsrc.push(tRes.data);
				}
			} catch (err) {
				// ignore
			}
		});

		await Promise.all(trackPromises);

		tracksWithIsrc.sort((a, b) => (a.track_position || 0) - (b.track_position || 0));

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
		options?: { concurrency?: number; delayMs?: number },
	): Promise<Map<string, EnrichedMetadata>> {
		const concurrency = options?.concurrency ?? 3;
		const delayMs = options?.delayMs ?? 200;
		const results = new Map<string, EnrichedMetadata>();
		const unique = [...new Set(isrcs.map((i) => i.trim().toUpperCase()).filter(Boolean))];

		this.logger.log(`Enriching ${unique.length} unique ISRCs (concurrency=${concurrency})...`);

		// Process in sliding-window batches
		for (let i = 0; i < unique.length; i += concurrency) {
			const batch = unique.slice(i, i + concurrency);
			const promises = batch.map(async (isrc) => {
				try {
					const meta = await this.enrichByIsrc(isrc);
					if (meta) results.set(isrc, meta);
				} catch (err) {
					this.logger.warn(`Failed to enrich ISRC ${isrc}: ${err.message}`);
				}
			});

			await Promise.all(promises);

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

	private async enrichFromSpotify(isrc: string): Promise<EnrichedMetadata | null> {
		const token = await this.spotifyService.getCacheToken();

		// Step 1: Search track by ISRC
		const searchRes = await axios.get(
			'https://api.spotify.com/v1/search',
			{
				params: { type: 'track', q: `isrc:${isrc}` },
				headers: { Authorization: `Bearer ${token}` },
				timeout: 15000,
			},
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
				const albumRes = await axios.get(
					`https://api.spotify.com/v1/albums/${album.id}`,
					{
						headers: { Authorization: `Bearer ${token}` },
						timeout: 15000,
					},
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
					const tracksRes = await axios.get(
						'https://api.spotify.com/v1/tracks',
						{
							params: { ids: chunk.join(',') },
							headers: { Authorization: `Bearer ${token}` },
							timeout: 15000,
						},
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

		// Fetch full track details to get ISRCs
		const trackItems = albumDetail?.tracks?.data || [];
		const tracksWithIsrc: any[] = [];
		const trackPromises = trackItems.slice(0, 50).map(async (t: any) => {
			try {
				const tRes = await axios.get(`https://api.deezer.com/track/${t.id}`, { timeout: 15000 });
				if (tRes.data && !tRes.data.error) {
					tracksWithIsrc.push(tRes.data);
				}
			} catch (err) {
				// ignore
			}
		});

		await Promise.all(trackPromises);
		tracksWithIsrc.sort((a, b) => (a.track_position || 0) - (b.track_position || 0));

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

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
