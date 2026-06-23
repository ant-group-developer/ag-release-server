import { Injectable, Logger } from '@nestjs/common';
import { SpotifyEnrichmentService } from './spotify-enrichment.service';
import { DeezerEnrichmentService } from './deezer-enrichment.service';
import { LocalEnrichmentService } from './local-enrichment.service';

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
	trackDeezerId?: string;
	trackSpotifyUrl?: string;
	trackDeezerUrl?: string;
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
	albumSpotifyUrl?: string;
	albumDeezerUrl?: string;
	releaseDate?: string; // 'YYYY-MM-DD'
	albumType?: string; // 'album' | 'single' | 'compilation'
	totalTracks?: number;
	albumCoverUrl?: string;
	albumCoverImages?: Array<{
		url: string;
		width?: number | null;
		height?: number | null;
		size?: string | null;
		source?: 'spotify' | 'deezer';
	}>;

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
		spotifyUrl?: string;
		deezerUrl?: string;
	}>;
}

interface EnrichmentLookupOptions {
	forceExternal?: boolean;
	checkCancelled?: () => Promise<void> | void;
}

@Injectable()
export class MetadataEnrichmentService {
	private readonly logger = new Logger(MetadataEnrichmentService.name);

	constructor(
		private readonly spotifyEnrichmentService: SpotifyEnrichmentService,
		private readonly deezerEnrichmentService: DeezerEnrichmentService,
		private readonly localEnrichmentService: LocalEnrichmentService,
	) {}

	// ─────────────────────────────────────────────────────
	// PUBLIC API
	// ─────────────────────────────────────────────────────

	async enrichByIsrc(
		isrc: string,
		options?: EnrichmentLookupOptions,
	): Promise<EnrichedMetadata | null> {
		if (options?.checkCancelled) {
			await options.checkCancelled();
		}
		if (!isrc?.trim()) return null;
		const normalizedIsrc = isrc.trim().toUpperCase();

		// ─── Local-first: check if ISRC already exists in DB ───
		if (!options?.forceExternal) {
			const localResult = await this.localEnrichmentService.findLocalByIsrc(normalizedIsrc);
			if (localResult) {
				this.logger.log(`[Local Cache] Found enriched ISRC ${normalizedIsrc} in local DB, skipping external API call`);
				return localResult;
			}
		}

		let spotifyResult: EnrichedMetadata | null = null;
		let deezerResult: EnrichedMetadata | null = null;
		let spotifyError: any = null;
		let deezerError: any = null;

		await Promise.all([
			this.spotifyEnrichmentService.enrichFromSpotify(normalizedIsrc)
				.then((res) => {
					spotifyResult = res;
				})
				.catch((err) => {
					if (err.response?.status === 404) {
						spotifyResult = null;
					} else {
						spotifyError = err;
					}
				}),
			this.deezerEnrichmentService.enrichFromDeezer(normalizedIsrc)
				.then((res) => {
					deezerResult = res;
				})
				.catch((err) => {
					if (
						err.response?.status === 404 ||
						err.response?.data?.error?.code === 800 ||
						err.data?.error?.code === 800
					) {
						deezerResult = null;
					} else {
						deezerError = err;
					}
				}),
		]);

		// If both APIs failed with fatal errors, throw a combined error to abort scanning
		if (spotifyError && deezerError) {
			throw new Error(`Both Spotify and Deezer failed. Spotify: ${spotifyError.message} | Deezer: ${deezerError.message}`);
		}

		// Log individual warnings if one failed but the other succeeded or returned benign not-found
		if (spotifyError) {
			this.logger.warn(`Spotify lookup failed for ISRC ${normalizedIsrc}: ${spotifyError.message}. Continuing since Deezer succeeded or returned benign.`);
		}
		if (deezerError) {
			this.logger.warn(`Deezer lookup failed for ISRC ${normalizedIsrc}: ${deezerError.message}. Continuing since Spotify succeeded or returned benign.`);
		}

		if (spotifyResult) {
			return this.mergeProviderMetadata(spotifyResult, deezerResult);
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
		if (options?.checkCancelled) {
			await options.checkCancelled();
		}
		if (!upc?.trim()) return null;
		const normalizedUpc = upc.trim();

		// ─── Local-first: check if UPC already exists in DB ───
		if (!options?.forceExternal) {
			const localResult = await this.localEnrichmentService.findLocalByUpc(normalizedUpc);
			if (localResult) {
				this.logger.log(`[Local Cache] Found enriched UPC ${normalizedUpc} in local DB, skipping external API call`);
				return localResult;
			}
		}

		let spotifyResult: EnrichedMetadata | null = null;
		let deezerResult: EnrichedMetadata | null = null;
		let spotifyError: any = null;
		let deezerError: any = null;

		await Promise.all([
			this.spotifyEnrichmentService.enrichFromSpotifyByUpc(normalizedUpc)
				.then((res) => {
					spotifyResult = res;
				})
				.catch((err) => {
					if (err.response?.status === 404) {
						spotifyResult = null;
					} else {
						spotifyError = err;
					}
				}),
			this.deezerEnrichmentService.enrichFromDeezerByUpc(normalizedUpc)
				.then((res) => {
					deezerResult = res;
				})
				.catch((err) => {
					if (
						err.response?.status === 404 ||
						err.response?.data?.error?.code === 800 ||
						err.data?.error?.code === 800
					) {
						deezerResult = null;
					} else {
						deezerError = err;
					}
				}),
		]);

		// If both APIs failed with fatal errors, throw a combined error to abort scanning
		if (spotifyError && deezerError) {
			throw new Error(`Both Spotify and Deezer failed. Spotify: ${spotifyError.message} | Deezer: ${deezerError.message}`);
		}

		// Log individual warnings if one failed but the other succeeded or returned benign not-found
		if (spotifyError) {
			this.logger.warn(`Spotify UPC lookup failed for UPC ${normalizedUpc}: ${spotifyError.message}. Continuing since Deezer succeeded or returned benign.`);
		}
		if (deezerError) {
			this.logger.warn(`Deezer UPC lookup failed for UPC ${normalizedUpc}: ${deezerError.message}. Continuing since Spotify succeeded or returned benign.`);
		}

		if (spotifyResult) {
			return this.mergeProviderMetadata(spotifyResult, deezerResult);
		}
		if (deezerResult) {
			return deezerResult;
		}

		return null;
	}

	/**
	 * Batch-enrich a list of ISRCs. Returns a Map<isrc, EnrichedMetadata>.
	 * Throttles requests to respect API rate limits.
	 */
	async enrichBatch(
		isrcs: string[],
		options?: { concurrency?: number; delayMs?: number; forceExternal?: boolean; checkCancelled?: () => Promise<void> | void },
	): Promise<Map<string, EnrichedMetadata>> {
		const concurrency = options?.concurrency ?? 3;
		const delayMs = options?.delayMs ?? 200;
		const results = new Map<string, EnrichedMetadata>();
		const unique = [...new Set(isrcs.map((i) => i.trim().toUpperCase()).filter(Boolean))];
		const batchCache = new Map<string, EnrichedMetadata>();

		this.logger.log(`Enriching ${unique.length} unique ISRCs (concurrency=${concurrency})...`);

		// Process in sliding-window batches
		for (let i = 0; i < unique.length; i += concurrency) {
			if (options?.checkCancelled) {
				await options.checkCancelled();
			}
			const batch = unique.slice(i, i + concurrency);
			const promises = batch.map(async (isrc) => {
				if (options?.checkCancelled) {
					await options.checkCancelled();
				}
				const cached = batchCache.get(isrc);
				if (cached) {
					results.set(isrc, cached);
					this.logger.log(`[Batch Cache] Found ISRC ${isrc} in current enrichment batch, skipping external API call`);
					return;
				}

				try {
					const meta = await this.enrichByIsrc(isrc, {
						forceExternal: options?.forceExternal,
						checkCancelled: options?.checkCancelled,
					});
					if (meta) {
						this.cacheBatchMetadata(batchCache, isrc, meta);
						results.set(isrc, batchCache.get(isrc) ?? this.buildMetadataForIsrc(meta, isrc));
					}
				} catch (err) {
					this.logger.error(`Failed to enrich ISRC ${isrc}: ${err.message}`);
					throw err; // Propagate fatal API error to halt scanning
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
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}

		this.logger.log(`Enrichment complete: ${results.size}/${unique.length} ISRCs resolved.`);
		return results;
	}

	private mergeProviderMetadata(
		primary: EnrichedMetadata,
		secondary: EnrichedMetadata | null,
	): EnrichedMetadata {
		if (!secondary) return primary;

		const tracksByIsrc = new Map<string, NonNullable<EnrichedMetadata['tracks']>[number]>();
		for (const track of primary.tracks || []) {
			const key = this.normalizeIsrc(track.isrc);
			if (key) tracksByIsrc.set(key, { ...track });
		}

		for (const track of secondary.tracks || []) {
			const key = this.normalizeIsrc(track.isrc);
			if (!key) continue;
			const current = tracksByIsrc.get(key) || { isrc: track.isrc, title: track.title };
			tracksByIsrc.set(key, {
				...current,
				title: current.title || track.title,
				duration: current.duration ?? track.duration,
				trackNumber: current.trackNumber ?? track.trackNumber,
				spotifyId: current.spotifyId || track.spotifyId,
				deezerId: current.deezerId || track.deezerId,
				spotifyUrl: current.spotifyUrl || track.spotifyUrl,
				deezerUrl: current.deezerUrl || track.deezerUrl,
			});
		}

		const coverImages = [
			...(primary.albumCoverImages || []),
			...(secondary.albumCoverImages || []),
		].filter((image, index, all) => {
			return image.url && all.findIndex((item) => item.url === image.url) === index;
		});

		return {
			...primary,
			trackDeezerId: primary.trackDeezerId || secondary.trackDeezerId,
			trackDeezerUrl: primary.trackDeezerUrl || secondary.trackDeezerUrl,
			trackSpotifyId: primary.trackSpotifyId || secondary.trackSpotifyId,
			trackSpotifyUrl: primary.trackSpotifyUrl || secondary.trackSpotifyUrl,
			artistDeezerId: primary.artistDeezerId || secondary.artistDeezerId,
			artistDeezerUrl: primary.artistDeezerUrl || secondary.artistDeezerUrl,
			artistSpotifyId: primary.artistSpotifyId || secondary.artistSpotifyId,
			artistSpotifyUrl: primary.artistSpotifyUrl || secondary.artistSpotifyUrl,
			albumDeezerId: primary.albumDeezerId || secondary.albumDeezerId,
			albumDeezerUrl: primary.albumDeezerUrl || secondary.albumDeezerUrl,
			albumSpotifyId: primary.albumSpotifyId || secondary.albumSpotifyId,
			albumSpotifyUrl: primary.albumSpotifyUrl || secondary.albumSpotifyUrl,
			albumCoverImages: coverImages,
			tracks: Array.from(tracksByIsrc.values()),
		};
	}

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
			trackDeezerId: matchedTrack.deezerId || meta.trackDeezerId,
			trackSpotifyUrl: matchedTrack.spotifyUrl || meta.trackSpotifyUrl,
			trackDeezerUrl: matchedTrack.deezerUrl || meta.trackDeezerUrl,
			trackDuration: matchedTrack.duration ?? meta.trackDuration,
		};
	}

	private normalizeIsrc(isrc?: string): string {
		return isrc?.trim().toUpperCase() || '';
	}
}
