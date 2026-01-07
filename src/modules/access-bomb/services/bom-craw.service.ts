import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { IsNull, Repository } from 'typeorm';
import { Release } from '../entities/metadata.entity';
import {
	Release_29_12,
	ReleaseBombAll,
	Track_29_12,
	TrackBombAll,
} from '../entities/metadata.entity.29-12';
import { TrackBomb } from '../entities/track-bomb.entity';
import { ParseDataCiService } from './parse-ci-v2.service';

@Injectable()
export class TrackBombCrawlService {
	constructor(
		@InjectRepository(TrackBomb)
		private readonly trackBombRepo: Repository<TrackBomb>,

		@InjectRepository(TrackBombAll)
		private readonly trackBombAllRepo: Repository<TrackBombAll>,

		@InjectRepository(ReleaseBombAll)
		private readonly releaseBombAllRepo: Repository<ReleaseBombAll>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Release_29_12)
		private readonly release_29_12_Repo: Repository<Release_29_12>,

		@InjectRepository(Track_29_12)
		private readonly track_29_12_Repo: Repository<Track_29_12>,

		private readonly parseDataCiService: ParseDataCiService,

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

	async crawlTrackMissingMetadata() {
		const tracks = await this.track_29_12_Repo.find({
			select: ['id'],
		});

		const concurrency = 50;
		const saveBatchSize = 200;

		const total = tracks.length;
		let processed = 0;
		let saved = 0;
		let fail = 0;

		let toSave: any[] = [];
		let saveBatchIndex = 0;

		for (let i = 0; i < tracks.length; i += concurrency) {
			const batch = tracks.slice(i, i + concurrency);

			const results = await Promise.all(
				batch.map(async (t) => {
					try {
						const trackLocal =
							await this.parseDataCiService.getTrackDetailLocal(
								t.id,
							);

						const primaryArtist = trackLocal.contributors.find(
							(c) => c.roleId === 49,
						);

						const artist = primaryArtist
							? trackLocal.artistName +
								'|' +
								primaryArtist.artist.name
							: trackLocal.artistName;

						// const composers = trackLocal.composerContentsDTO?.length
						// 	? trackLocal.composerContentsDTO
						// 			.map((c) => c.composerName)
						// 			.filter(Boolean)
						// 			.join('|')
						// 	: null;

						// const languageId = trackLocal.languageId;

						// const hasInstruments = true;

						return this.track_29_12_Repo.create({
							id: t.id,
							// composers: composers ?? '',
							// hasInstruments: hasInstruments,
							// languageId,
							artist,
						});
					} catch {
						fail++;
						return null;
					}
				}),
			);

			for (const item of results) {
				processed++;
				if (!item) continue;

				toSave.push(item);

				if (toSave.length >= saveBatchSize) {
					saveBatchIndex++;
					await this.track_29_12_Repo.save(toSave);
					saved += toSave.length;
					toSave = [];
				}
			}
		}

		if (toSave.length) {
			saveBatchIndex++;
			await this.track_29_12_Repo.save(toSave);
			saved += toSave.length;
		}

		return {
			total,
			processed,
			saved,
			fail,
		};
	}

	// async crawlTrackMetadataAll(token: string) {
	// 	const tracks = await this.trackBombRepo.find({
	// 		// where: { track_file_name: IsNull() },
	// 		select: ['id'],
	// 	});

	// 	const concurrency = 20;
	// 	const saveBatchSize = 100;

	// 	const total = tracks.length;
	// 	let processed = 0;
	// 	let saved = 0;
	// 	let fail = 0;

	// 	let toSave: TrackBombAll[] = [];
	// 	let saveBatchIndex = 0;

	// 	console.log(`[CRAWL_ALL][START] total=${total}`);

	// 	for (let i = 0; i < tracks.length; i += concurrency) {
	// 		const batch = tracks.slice(i, i + concurrency);
	// 		const batchIndex = Math.floor(i / concurrency) + 1;

	// 		console.log(
	// 			`[CRAWL_ALL][FETCH BATCH ${batchIndex}] ${processed}/${total}`,
	// 			batch.map((t) => t.id),
	// 		);

	// 		const results = await Promise.all(
	// 			batch.map(async (t) => {
	// 				try {
	// 					const data = await this.getTrackDetail(token, t.id);
	// 					return { id: t.id, data };
	// 				} catch (err) {
	// 					fail++;
	// 					console.error(`[CRAWL_ALL][FAIL] trackId=${t.id}`);
	// 					return null;
	// 				}
	// 			}),
	// 		);

	// 		for (const item of results) {
	// 			processed++;
	// 			if (!item) continue;

	// 			toSave.push(
	// 				this.trackBombAllRepo.create({
	// 					id: item.id,
	// 					response: item.data,
	// 				}),
	// 			);

	// 			if (toSave.length >= saveBatchSize) {
	// 				saveBatchIndex++;
	// 				console.log(
	// 					`[CRAWL_ALL][SAVE BATCH ${saveBatchIndex}] saving ${toSave.length} (${processed}/${total})`,
	// 				);
	// 				await this.trackBombAllRepo.save(toSave);
	// 				saved += toSave.length;
	// 				toSave = [];
	// 			}
	// 		}
	// 	}

	// 	if (toSave.length) {
	// 		saveBatchIndex++;
	// 		console.log(
	// 			`[CRAWL_ALL][SAVE BATCH ${saveBatchIndex}] saving remaining ${toSave.length}`,
	// 		);
	// 		await this.trackBombAllRepo.save(toSave);
	// 		saved += toSave.length;
	// 	}

	// 	console.log(
	// 		`[CRAWL_ALL][END] total=${total}, processed=${processed}, saved=${saved}, fail=${fail}`,
	// 	);

	// 	return {
	// 		total,
	// 		processed,
	// 		saved,
	// 		fail,
	// 	};
	// }

	async crawlTrackMetadataAll(token: string) {
		const tracks = await this.trackBombRepo.find({
			select: ['id'],
		});

		const concurrency = 20;
		const saveBatchSize = 200;

		const total = tracks.length;
		let processed = 0;
		let saved = 0;
		let fail = 0;

		let buffer: { id: number; response: any }[] = [];

		console.log(`[CRAWL_ALL][START] total=${total}`);

		for (let i = 0; i < tracks.length; i += concurrency) {
			const batch = tracks.slice(i, i + concurrency);

			const results = await Promise.all(
				batch.map(async (t) => {
					try {
						const data = await this.getTrackDetail(token, t.id);
						return { id: t.id, response: data };
					} catch {
						fail++;
						return null;
					}
				}),
			);

			for (const item of results) {
				processed++;
				if (!item) continue;

				buffer.push(item);

				if (buffer.length >= saveBatchSize) {
					await this.trackBombAllRepo
						.createQueryBuilder()
						.insert()
						.values(buffer)
						.orUpdate(['response'], ['id'])
						.execute();

					saved += buffer.length;
					buffer = [];

					console.log(`[CRAWL_ALL][PROGRESS] ${saved}/${total}`);
				}
			}
		}

		if (buffer.length) {
			await this.trackBombAllRepo
				.createQueryBuilder()
				.insert()
				.values(buffer)
				.orUpdate(['response'], ['id'])
				.execute();

			saved += buffer.length;
			console.log(`[CRAWL_ALL][PROGRESS] ${saved}/${total}`);
		}

		console.log(
			`[CRAWL_ALL][END] total=${total} saved=${saved} fail=${fail}`,
		);

		return {
			total,
			saved,
			fail,
		};
	}

	async crawlMissingReleaseMetadata(token: string) {
		const releases = await this.releaseRepo.find({
			// where: { primary_genre: IsNull() },
			// where: { artist: IsNull() },
			select: ['id'],
		});

		const concurrency = 10;
		const saveBatchSize = 50;

		let processed = 0;
		let updated = 0;
		let fail = 0;
		let toSave: Release_29_12[] = [];

		for (let i = 0; i < releases.length; i += concurrency) {
			const batch = releases.slice(i, i + concurrency);

			const results = await Promise.all(
				batch.map(async (r) => {
					try {
						const data = await this.getReleaseDetail2(token, r.id);
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

				const primaryArtist = item.data.contributors.find(
					(c) => c.roleId === 49,
				);

				const artist = primaryArtist
					? item.data.artistName + '|' + primaryArtist.artist.name
					: item.data.artistName;

				// const parseCopyright = (v?: string | null) => {
				// 	if (!v) return { year: null, text: null };
				// 	const m = v.trim().match(/^(\d{4})\s*(.*)$/);
				// 	return {
				// 		year: m ? Number(m[1]) : null,
				// 		text: m ? m[2] || null : v,
				// 	};
				// };

				// const { year: pLineYear, text: pLineText } = parseCopyright(
				// 	item.data.copyrightP,
				// );
				// const { year: cLineYear, text: cLineText } = parseCopyright(
				// 	item.data.copyrightC,
				// );

				toSave.push(
					this.release_29_12_Repo.create({
						id: item.id,
						// pYear: pLineYear,
						// pHolder: pLineText,
						// cYear: cLineYear,
						// cHolder: cLineText,

						artist,
					}),
				);

				if (toSave.length >= saveBatchSize) {
					await this.release_29_12_Repo.save(toSave);
					updated += toSave.length;
					toSave = [];
				}
			}
		}

		if (toSave.length) {
			await this.release_29_12_Repo.save(toSave);
			updated += toSave.length;

			// console.log(toSave);
		}

		return { processed, updated, fail };
	}

	async crawlReleaseMetadataAll(token: string) {
		const releases = await this.releaseRepo.find({
			select: ['id'],
		});

		const concurrency = 20;
		const saveBatchSize = 100;

		const total = releases.length;
		let processed = 0;
		let saved = 0;
		let fail = 0;

		let toSave: ReleaseBombAll[] = [];
		let saveBatchIndex = 0;

		console.log(`[CRAWL_RELEASE_ALL][START] total=${total}`);

		for (let i = 0; i < releases.length; i += concurrency) {
			const batch = releases.slice(i, i + concurrency);
			const batchIndex = Math.floor(i / concurrency) + 1;

			console.log(
				`[CRAWL_RELEASE_ALL][FETCH BATCH ${batchIndex}] ${processed}/${total}`,
				batch.map((r) => r.id),
			);

			const results = await Promise.all(
				batch.map(async (r) => {
					try {
						const data = await this.getReleaseDetail2(token, r.id);
						return { id: r.id, data };
					} catch {
						fail++;
						console.error(
							`[CRAWL_RELEASE_ALL][FAIL] releaseId=${r.id}`,
						);
						return null;
					}
				}),
			);

			for (const item of results) {
				processed++;
				if (!item) continue;

				toSave.push(
					this.releaseBombAllRepo.create({
						id: item.id,
						response: item.data,
					}),
				);

				if (toSave.length >= saveBatchSize) {
					saveBatchIndex++;
					console.log(
						`[CRAWL_RELEASE_ALL][SAVE BATCH ${saveBatchIndex}] saving ${toSave.length} (${processed}/${total})`,
					);
					await this.releaseBombAllRepo.save(toSave);
					saved += toSave.length;
					toSave = [];
				}
			}
		}

		if (toSave.length) {
			saveBatchIndex++;
			console.log(
				`[CRAWL_RELEASE_ALL][SAVE BATCH ${saveBatchIndex}] saving remaining ${toSave.length}`,
			);
			await this.releaseBombAllRepo.save(toSave);
			saved += toSave.length;
		}

		console.log(
			`[CRAWL_RELEASE_ALL][END] total=${total}, processed=${processed}, saved=${saved}, fail=${fail}`,
		);

		return {
			total,
			processed,
			saved,
			fail,
		};
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

	// private async getReleaseDetail(token: string, releaseId: number) {
	// 	const { data } = await firstValueFrom(
	// 		this.http.get(
	// 			`https://api.revelator.com/content/release/${releaseId}`,
	// 			{ headers: this.headers(token) },
	// 		),
	// 	);
	// 	return data;
	// }

	private async getReleaseDetail2(token: string, releaseId: number) {
		const data =
			await this.parseDataCiService.getReleaseDetailLocal(releaseId);
		return data;
	}
}
