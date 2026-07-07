import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { EnrichedMetadata } from './metadata-enrichment.service';

@Injectable()
export class DeezerEnrichmentService {
	private readonly logger = new Logger(DeezerEnrichmentService.name);

	async enrichFromDeezer(isrc: string): Promise<EnrichedMetadata | null> {
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
		const allTrackItems = albumDetail
			? await this.fetchAllDeezerAlbumTracks(albumDetail)
			: [];

		// Fetch full track details (with ISRC) in chunks
		const tracksWithIsrc =
			await this.fetchDeezerTrackDetails(allTrackItems);

		// Extract genres from album detail
		const genres =
			albumDetail?.genres?.data
				?.map((g: any) => g.name)
				.filter(Boolean) || [];

		return {
			source: 'deezer',
			isrc,

			// Track
			trackTitle: trackData.title_short || trackData.title || '',
			trackDeezerId: trackData.id?.toString(),
			trackDeezerUrl: trackData.link,
			trackDuration: trackData.duration
				? trackData.duration * 1000
				: undefined, // Deezer returns seconds

			// Artist
			artistName: artist?.name || '',
			artistDeezerId: artist?.id?.toString(),
			artistDeezerUrl: artist?.link,
			artistPicture: artist?.picture_big || artist?.picture_medium,

			// Album
			upc,
			albumTitle: albumDetail?.title || albumRef?.title || '',
			albumDeezerId: albumRef?.id?.toString(),
			albumDeezerUrl: albumDetail?.link || albumRef?.link,
			releaseDate: albumDetail?.release_date || trackData.release_date,
			albumType: albumDetail?.record_type,
			totalTracks: albumDetail?.nb_tracks,
			albumCoverUrl: albumRef?.cover_big || albumRef?.cover_xl,
			albumCoverImages: this.buildDeezerCoverImages(
				albumDetail || albumRef,
			),

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
				deezerUrl: t.link,
			})),
		};
	}

	async enrichFromDeezerByUpc(upc: string): Promise<EnrichedMetadata | null> {
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
		const tracksWithIsrc =
			await this.fetchDeezerTrackDetails(allTrackItems);

		const primaryIsrc = tracksWithIsrc[0]?.isrc || '';

		return {
			source: 'deezer',
			isrc: primaryIsrc,

			// Track
			trackTitle:
				tracksWithIsrc[0]?.title_short ||
				tracksWithIsrc[0]?.title ||
				'',
			trackDeezerId: tracksWithIsrc[0]?.id?.toString(),
			trackDeezerUrl: tracksWithIsrc[0]?.link,
			trackDuration: tracksWithIsrc[0]?.duration
				? tracksWithIsrc[0]?.duration * 1000
				: undefined,

			// Artist
			artistName: artist?.name || '',
			artistDeezerId: artist?.id?.toString(),
			artistDeezerUrl: artist?.link,
			artistPicture: artist?.picture_big || artist?.picture_medium,

			// Album
			upc,
			albumTitle: albumDetail.title || '',
			albumDeezerId: albumDetail.id?.toString(),
			albumDeezerUrl: albumDetail.link,
			releaseDate: albumDetail.release_date,
			albumType: albumDetail.record_type,
			totalTracks: albumDetail.nb_tracks,
			albumCoverUrl: albumDetail.cover_big || albumDetail.cover_xl,
			albumCoverImages: this.buildDeezerCoverImages(albumDetail),

			// Label & Copyright
			labelName: albumDetail.label,
			copyrights: albumDetail.copyrights || undefined,
			genres:
				albumDetail.genres?.data
					?.map((g: any) => g.name)
					.filter(Boolean) || [],

			// Track list
			tracks: tracksWithIsrc.map((t) => ({
				isrc: t.isrc || '',
				title: t.title_short || t.title || '',
				duration: t.duration ? t.duration * 1000 : undefined,
				trackNumber: t.track_position,
				deezerId: t.id?.toString(),
				deezerUrl: t.link,
			})),
		};
	}

	buildDeezerCoverImages(album?: any): EnrichedMetadata['albumCoverImages'] {
		const sizeMap: Array<[string, string, number | null]> = [
			['small', 'cover_small', 56],
			['medium', 'cover_medium', 250],
			['big', 'cover_big', 500],
			['xl', 'cover_xl', 1000],
		];

		const images: NonNullable<EnrichedMetadata['albumCoverImages']> = [];
		for (const [size, key, dimension] of sizeMap) {
			const url = album?.[key];
			if (!url) continue;
			images.push({
				url,
				width: dimension,
				height: dimension,
				size,
				source: 'deezer' as const,
			});
		}

		return images;
	}

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
				this.logger.warn(
					`Deezer album tracks pagination failed: ${err.message}`,
				);
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
					const tRes = await axios.get(
						`https://api.deezer.com/track/${t.id}`,
						{ timeout: 15000 },
					);
					if (tRes.data && !tRes.data.error) {
						tracksWithIsrc.push(tRes.data);
					}
				} catch (err) {
					this.logger.warn(
						`Deezer track detail fetch failed for track ${t.id}: ${err.message}`,
					);
				}
			});
			await Promise.all(promises);

			// Delay between chunks to respect Deezer rate limits
			if (i + chunkSize < trackItems.length) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		}

		tracksWithIsrc.sort(
			(a, b) => (a.track_position || 0) - (b.track_position || 0),
		);
		return tracksWithIsrc;
	}
}
