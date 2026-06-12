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
}

@Injectable()
export class MetadataEnrichmentService {
	private readonly logger = new Logger(MetadataEnrichmentService.name);

	constructor(private readonly spotifyService: SpotifyService) {}

	// ─────────────────────────────────────────────────────
	// PUBLIC API
	// ─────────────────────────────────────────────────────

	/**
	 * Look up an ISRC via Spotify first; if Spotify returns nothing
	 * or throws, fall back to the Deezer public API.
	 */
	async enrichByIsrc(isrc: string): Promise<EnrichedMetadata | null> {
		if (!isrc?.trim()) return null;
		const normalizedIsrc = isrc.trim().toUpperCase();

		// 1) Try Spotify
		try {
			const result = await this.enrichFromSpotify(normalizedIsrc);
			if (result) return result;
		} catch (err) {
			this.logger.warn(
				`Spotify lookup failed for ISRC ${normalizedIsrc}: ${err.message}`,
			);
		}

		// 2) Fallback: Deezer (no auth required)
		try {
			const result = await this.enrichFromDeezer(normalizedIsrc);
			if (result) return result;
		} catch (err) {
			this.logger.warn(
				`Deezer lookup failed for ISRC ${normalizedIsrc}: ${err.message}`,
			);
		}

		return null;
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
		};
	}

	// ─────────────────────────────────────────────────────
	// UTILS
	// ─────────────────────────────────────────────────────

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
