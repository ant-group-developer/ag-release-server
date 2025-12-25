import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { IsNull, Repository } from 'typeorm';
import { Release } from '../entities/metadata.entity';
import { TrackBomb } from '../entities/track-bomb.entity';

@Injectable()
export class TrackBombCrawlService {
	constructor(
		@InjectRepository(TrackBomb)
		private readonly trackBombRepo: Repository<TrackBomb>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		private readonly http: HttpService,
	) {}

	private headers(token: string) {
		return {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			Origin: 'https://bombshelter.revelator.pro',
			'x-client-source': 'revelator-pro-app',
		};
	}

	// async crawlMissingMetadata(token: string) {
	// 	const tracks = await this.trackBombRepo.find({
	// 		where: { is_metadata_filled: false },
	// 		select: ['id'],
	// 	});

	// 	const concurrency = 20;
	// 	const toSave: TrackBomb[] = [];
	// 	let fail = 0;

	// 	console.log(
	// 		`[CRAWL][START] total tracks need metadata = ${tracks.length}`,
	// 	);

	// 	for (let i = 0; i < tracks.length; i += concurrency) {
	// 		const batch = tracks.slice(i, i + concurrency);
	// 		const batchIndex = Math.floor(i / concurrency) + 1;

	// 		console.log(
	// 			`[CRAWL][BATCH ${batchIndex}] processing ${batch.length} tracks`,
	// 			batch.map((t) => t.id),
	// 		);

	// 		const details = await Promise.all(
	// 			batch.map(async (t) => {
	// 				try {
	// 					const data = await this.getTrackDetail(token, t.id);
	// 					console.log(`[CRAWL][OK] trackId=${t.id}`);
	// 					return { id: t.id, data };
	// 				} catch (err) {
	// 					fail++;
	// 					console.error(
	// 						`[CRAWL][FAIL] trackId=${t.id}`,
	// 						err?.message ?? err,
	// 					);
	// 					return null;
	// 				}
	// 			}),
	// 		);

	// 		for (const item of details) {
	// 			if (!item) continue;
	// 			const d = item.data;

	// 			toSave.push(
	// 				this.trackBombRepo.create({
	// 					id: item.id,
	// 					available_separately: d.clearedForSale ?? null,
	// 					explicit: d.explicit ?? null,
	// 					preview_start_seconds: d.previewStartSeconds ?? null,
	// 					language_id: d.languageId ?? null,
	// 					has_vocals: d.trackProperties?.includes(1) ?? null,
	// 					has_instruments: d.trackProperties?.includes(2) ?? null,
	// 					main_genre: d.primaryMusicStyleId ?? null,
	// 					p_line_text: d.copyrightP ?? null,
	// 					p_line_year: d.copyrightP
	// 						? Number(d.copyrightP.match(/\d{4}/)?.[0])
	// 						: null,
	// 					cleared_for_sale: d.clearedForSale ?? null,
	// 					previously_released: d.previouslyReleased ?? null,
	// 					artist_apple_id: d.artistAppleId ?? null,
	// 					artist_spotify_id: d.artistSpotifyId ?? null,
	// 					spotify_track_id: d.spotifyId ?? null,
	// 					apple_track_id: d.appleId ?? null,
	// 					deezer_track_id: d.releaseTracks?.[0]?.deezerId ?? null,
	// 					is_metadata_filled: true,
	// 				}),
	// 			);
	// 		}

	// 		console.log(
	// 			`[CRAWL][BATCH ${batchIndex}] done – collected=${toSave.length}, fail=${fail}`,
	// 		);
	// 	}

	// 	if (toSave.length) {
	// 		console.log(`[CRAWL][SAVE] saving ${toSave.length} records`);
	// 		await this.trackBombRepo.save(toSave);
	// 	}

	// 	console.log(
	// 		`[CRAWL][END] total=${tracks.length}, updated=${toSave.length}, fail=${fail}`,
	// 	);

	// 	return {
	// 		total: tracks.length,
	// 		updated: toSave.length,
	// 		fail,
	// 	};
	// }

	async crawlMissingMetadata(token: string) {
		const tracks = await this.trackBombRepo.find({
			// where: { is_metadata_filled: false },
			where: { track_file_name: IsNull() },
			select: ['id'],
		});

		const concurrency = 20;
		const saveBatchSize = 100;

		const total = tracks.length;
		let processed = 0;
		let updated = 0;
		let fail = 0;

		let toSave: TrackBomb[] = [];
		let saveBatchIndex = 0;

		console.log(`[CRAWL][START] total tracks = ${total}`);

		for (let i = 0; i < tracks.length; i += concurrency) {
			const batch = tracks.slice(i, i + concurrency);
			const batchIndex = Math.floor(i / concurrency) + 1;

			console.log(
				`[CRAWL][FETCH BATCH ${batchIndex}] ${processed}/${total}`,
				batch.map((t) => t.id),
			);

			const details = await Promise.all(
				batch.map(async (t) => {
					try {
						const data = await this.getTrackDetail(token, t.id);
						return { id: t.id, data };
					} catch (err) {
						fail++;
						console.error(
							`[CRAWL][FAIL] trackId=${t.id}`,
							err?.message ?? err,
						);
						return null;
					}
				}),
			);

			for (const item of details) {
				processed++;

				if (!item) continue;
				const d = item.data;

				toSave.push(
					this.trackBombRepo.create({
						id: item.id,
						// available_separately: d.clearedForSale ?? null,
						// explicit: d.explicit ?? null,
						// preview_start_seconds: d.previewStartSeconds ?? null,
						// language_id: d.languageId ?? null,
						// has_vocals: d.trackProperties?.includes(1) ?? null,
						// has_instruments: d.trackProperties?.includes(2) ?? null,
						// main_genre: d.primaryMusicStyleId ?? null,
						// p_line_text: d.copyrightP ?? null,
						// p_line_year: d.copyrightP
						// 	? Number(d.copyrightP.match(/\d{4}/)?.[0])
						// 	: null,
						// cleared_for_sale: d.clearedForSale ?? null,
						// previously_released: d.previouslyReleased ?? null,
						// artist_apple_id: d.artistAppleId ?? null,
						// artist_spotify_id: d.artistSpotifyId ?? null,
						// spotify_track_id: d.spotifyId ?? null,
						// apple_track_id: d.appleId ?? null,
						// deezer_track_id: d.releaseTracks?.[0]?.deezerId ?? null,
						// is_metadata_filled: true,

						track_file_name: d.wav.filename ?? null,
					}),
				);

				if (toSave.length >= saveBatchSize) {
					saveBatchIndex++;
					console.log(
						`[CRAWL][SAVE BATCH ${saveBatchIndex}] saving ${toSave.length} records (${processed}/${total})`,
					);

					await this.trackBombRepo.save(toSave);
					updated += toSave.length;
					toSave = [];
				}
			}
		}

		// save phần dư
		if (toSave.length) {
			saveBatchIndex++;
			console.log(
				`[CRAWL][SAVE BATCH ${saveBatchIndex}] saving remaining ${toSave.length} records (${processed}/${total})`,
			);

			await this.trackBombRepo.save(toSave);
			updated += toSave.length;
		}

		console.log(
			`[CRAWL][END] total=${total}, processed=${processed}, updated=${updated}, fail=${fail}`,
		);

		return {
			total,
			processed,
			updated,
			fail,
		};
	}

	async crawlMissingReleaseMetadata(token: string) {
		const releases = await this.releaseRepo.find({
			// where: { primary_genre: IsNull() },
			where: { artist: IsNull() },
			select: ['id'],
		});

		const concurrency = 10;
		const saveBatchSize = 50;

		let processed = 0;
		let updated = 0;
		let fail = 0;
		let toSave: Release[] = [];

		for (let i = 0; i < releases.length; i += concurrency) {
			const batch = releases.slice(i, i + concurrency);

			const results = await Promise.all(
				batch.map(async (r) => {
					try {
						const data = await this.getReleaseDetail(token, r.id);
						return { id: r.id, data };
					} catch {
						fail++;
						return null;
					}
				}),
			);

			for (const item of results) {
				processed++;
				if (!item) continue;

				toSave.push(
					this.releaseRepo.create({
						id: item.id,
						// primary_genre: item.data?.primaryMusicStyleId ?? null,
						artist: item.data.artistName,
					}),
				);

				if (toSave.length >= saveBatchSize) {
					await this.releaseRepo.save(toSave);
					updated += toSave.length;
					toSave = [];
				}
			}
		}

		if (toSave.length) {
			await this.releaseRepo.save(toSave);
			updated += toSave.length;

			// console.log(toSave);
		}

		return { processed, updated, fail };
	}

	private async getTrackDetail(token: string, trackId: number) {
		const { data } = await firstValueFrom(
			this.http.get(
				`https://api.revelator.com/content/track/${trackId}`,
				{ headers: this.headers(token) },
			),
		);
		return data;
	}

	private async getReleaseDetail(token: string, releaseId: number) {
		const { data } = await firstValueFrom(
			this.http.get(
				`https://api.revelator.com/content/release/${releaseId}`,
				{ headers: this.headers(token) },
			),
		);
		return data;
	}
}
