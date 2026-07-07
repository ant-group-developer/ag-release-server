import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { EnrichedMetadata } from './metadata-enrichment.service';
import { SpotifyService } from './spotify.service';

const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 30_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

@Injectable()
export class SpotifyEnrichmentService {
	private readonly logger = new Logger(SpotifyEnrichmentService.name);
	private spotifyBlockedUntil = 0;

	constructor(private readonly spotifyService: SpotifyService) {}

	async enrichFromSpotify(isrc: string): Promise<EnrichedMetadata | null> {
		const token = await this.spotifyService.getCacheToken();

		// Step 1: Search track by ISRC
		const searchRes = await this.spotifyService.enqueue(() =>
			this.requestWithRetry(() =>
				axios.get('https://api.spotify.com/v1/search', {
					params: { type: 'track', q: `isrc:${isrc}` },
					headers: { Authorization: `Bearer ${token}` },
					timeout: 15000,
				}),
			),
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
					this.requestWithRetry(() =>
						axios.get(
							`https://api.spotify.com/v1/albums/${album.id}`,
							{
								headers: { Authorization: `Bearer ${token}` },
								timeout: 15000,
							},
						),
					),
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
						this.requestWithRetry(() =>
							axios.get('https://api.spotify.com/v1/tracks', {
								params: { ids: chunk.join(',') },
								headers: { Authorization: `Bearer ${token}` },
								timeout: 15000,
							}),
						),
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
			trackSpotifyUrl: track.external_urls?.spotify,
			trackDuration: track.duration_ms,

			// Artist
			artistName: artist?.name || '',
			artistSpotifyId: artist?.id,
			artistSpotifyUrl: artist?.external_urls?.spotify,

			// Album
			upc,
			albumTitle: albumDetail?.name || album?.name || '',
			albumSpotifyId: album?.id,
			albumSpotifyUrl:
				albumDetail?.external_urls?.spotify ||
				album?.external_urls?.spotify,
			releaseDate: albumDetail?.release_date || album?.release_date,
			albumType: albumDetail?.album_type || album?.album_type,
			totalTracks: albumDetail?.total_tracks || album?.total_tracks,
			albumCoverUrl: (albumDetail?.images || album?.images)?.[0]?.url,
			albumCoverImages: this.buildSpotifyCoverImages(
				albumDetail?.images || album?.images,
			),

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
				spotifyUrl: t.external_urls?.spotify,
			})),
		};
	}

	async enrichFromSpotifyByUpc(
		upc: string,
	): Promise<EnrichedMetadata | null> {
		const token = await this.spotifyService.getCacheToken();

		// Step 1: Search album by UPC
		const searchRes = await this.spotifyService.enqueue(() =>
			this.requestWithRetry(() =>
				axios.get('https://api.spotify.com/v1/search', {
					params: { type: 'album', q: `upc:${upc}` },
					headers: { Authorization: `Bearer ${token}` },
					timeout: 15000,
				}),
			),
		);

		const items = searchRes.data?.albums?.items;
		if (!items || items.length === 0) return null;

		const album = items[0];

		// Step 2: Fetch full album details
		let albumDetail: any = null;
		if (album?.id) {
			try {
				const albumRes = await this.spotifyService.enqueue(() =>
					this.requestWithRetry(() =>
						axios.get(
							`https://api.spotify.com/v1/albums/${album.id}`,
							{
								headers: { Authorization: `Bearer ${token}` },
								timeout: 15000,
							},
						),
					),
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
						this.requestWithRetry(() =>
							axios.get('https://api.spotify.com/v1/tracks', {
								params: { ids: chunk.join(',') },
								headers: { Authorization: `Bearer ${token}` },
								timeout: 15000,
							}),
						),
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
			trackSpotifyUrl: tracksWithIsrc[0]?.external_urls?.spotify,
			trackDuration: tracksWithIsrc[0]?.duration_ms,

			// Artist
			artistName: artist?.name || '',
			artistSpotifyId: artist?.id,
			artistSpotifyUrl: artist?.external_urls?.spotify,

			// Album
			upc,
			albumTitle: albumDetail.name || '',
			albumSpotifyId: albumDetail.id,
			albumSpotifyUrl:
				albumDetail.external_urls?.spotify ||
				album.external_urls?.spotify,
			releaseDate: albumDetail.release_date,
			albumType: albumDetail.album_type,
			totalTracks: albumDetail.total_tracks,
			albumCoverUrl: albumDetail.images?.[0]?.url,
			albumCoverImages: this.buildSpotifyCoverImages(albumDetail.images),

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
				spotifyUrl: t.external_urls?.spotify,
			})),
		};
	}

	buildSpotifyCoverImages(
		images?: any[],
	): EnrichedMetadata['albumCoverImages'] {
		return (images || [])
			.filter((image) => image?.url)
			.map((image) => ({
				url: image.url,
				width: image.width ?? null,
				height: image.height ?? null,
				size:
					image.width && image.height
						? `${image.width}x${image.height}`
						: null,
				source: 'spotify' as const,
			}));
	}

	private async requestWithRetry<T>(
		fn: () => Promise<T>,
		retries = 5,
		delayMs = 1000,
	): Promise<T> {
		if (Date.now() < this.spotifyBlockedUntil) {
			const remainingTime = Math.ceil(
				(this.spotifyBlockedUntil - Date.now()) / 1000,
			);
			this.logger.warn(
				`[Spotify API] Circuit open. Spotify API is rate-limited. Skipping request. Try again in ${remainingTime}s.`,
			);
			throw new Error(
				`Spotify rate limit active. Blocked for another ${remainingTime}s.`,
			);
		}

		try {
			return await fn();
		} catch (err) {
			const axiosError = err as AxiosError;
			if (axiosError.response?.status === 429) {
				const retryAfterHeader =
					axiosError.response.headers?.['retry-after'];
				const retryAfterMs = this.parseRetryAfterMs(retryAfterHeader);
				const maxWaitMs = this.getPositiveEnvMs(
					'SPOTIFY_MAX_RATE_LIMIT_WAIT_MS',
					DEFAULT_MAX_RATE_LIMIT_WAIT_MS,
				);
				const requestedWaitMs =
					retryAfterMs !== null ? retryAfterMs + 500 : delayMs;

				// If the required wait is longer than our max wait tolerance (e.g. 30s),
				// we trip the circuit breaker so subsequent calls fail fast immediately.
				if (requestedWaitMs > maxWaitMs) {
					this.spotifyBlockedUntil = Date.now() + requestedWaitMs;
					this.logger.error(
						`[Spotify API] Rate limit wait time (${requestedWaitMs / 1000}s) exceeds maximum tolerance (${maxWaitMs / 1000}s). Tripping circuit breaker until ${new Date(this.spotifyBlockedUntil).toISOString()}.`,
					);
					throw err;
				}

				if (retries <= 0) throw err;

				const waitTime = Math.min(requestedWaitMs, maxWaitMs);

				this.logger.warn(
					`[Spotify API] 429 Too Many Requests. Retrying after ${waitTime}ms (retry-after=${retryAfterHeader ?? 'n/a'}, remaining retries: ${retries})...`,
				);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
				return this.requestWithRetry(
					fn,
					retries - 1,
					Math.min(delayMs * 2, maxWaitMs),
				);
			}

			if (
				retries > 0 &&
				(!axiosError.response || axiosError.response.status >= 500)
			) {
				const maxRetryDelayMs = this.getPositiveEnvMs(
					'SPOTIFY_MAX_RETRY_DELAY_MS',
					DEFAULT_MAX_RETRY_DELAY_MS,
				);
				const waitTime = Math.min(delayMs, maxRetryDelayMs);
				this.logger.warn(
					`[Spotify API] Request failed (${axiosError.response?.status || 'network error'}). Retrying in ${waitTime}ms...`,
				);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
				return this.requestWithRetry(
					fn,
					retries - 1,
					Math.min(delayMs * 2, maxRetryDelayMs),
				);
			}

			throw err;
		}
	}

	private getPositiveEnvMs(name: string, fallback: number): number {
		const value = Number(process.env[name]);
		return Number.isFinite(value) && value > 0 ? value : fallback;
	}

	private parseRetryAfterMs(value: unknown): number | null {
		if (!value) return null;
		const raw = Array.isArray(value) ? value[0] : String(value);
		const seconds = Number(raw);
		if (Number.isFinite(seconds) && seconds >= 0) {
			return seconds * 1000;
		}

		const dateMs = Date.parse(raw);
		if (!Number.isNaN(dateMs)) {
			return Math.max(0, dateMs - Date.now());
		}

		return null;
	}
}
