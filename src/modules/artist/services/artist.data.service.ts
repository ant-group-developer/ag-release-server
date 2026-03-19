import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { Parser } from 'json2csv';
import pLimit from 'p-limit';
import path from 'path';
import * as readline from 'readline';
import { firstValueFrom } from 'rxjs';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { normalizeName } from 'src/utils/util';
import { ILike, IsNull, Not, Repository } from 'typeorm';
import { Artist } from '../entities/artist.entity';
import { ArtistSource } from '../enum/artist.enum';
import { ArtistService } from './artist.service';
export class ArtistDataInit {
	private logger = new Logger(ArtistDataInit.name);

	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,
		private readonly artistService: ArtistService,
		private readonly httpService: HttpService,
	) {}

	async importArtistsFromFile(filePath: string) {
		const fileStream = fs.createReadStream(filePath);
		const rl = readline.createInterface({ input: fileStream });

		const usedCodes = new Set<string>();
		const batch: Artist[] = [];
		let lineCount = 0;

		for await (const line of rl) {
			if (!line.trim() || line.startsWith('"id"')) continue;

			const cols = line.split(',');
			const rawName = cols[2];
			const rawId = cols[0];
			if (!rawName) continue;

			const name = rawName.replace(/^"|"$/g, '').trim();
			const id = rawId.replace(/^"|"$/g, '').trim();
			if (!name) continue;

			const baseCode = normalizeName(name);
			let code = baseCode;
			let counter = 0;

			// đảm bảo code duy nhất trong toàn file
			while (usedCodes.has(code)) {
				counter++;
				code = `${baseCode}_${counter}`;
			}
			usedCodes.add(code);

			if (
				name.length <= DEFAULT_LENGTH_NAME &&
				code.length <= DEFAULT_LENGTH_CODE
			)
				batch.push(
					this.artistRepo.create({
						name,
						code,
						artistSource: ArtistSource.ADA,
						idSource: id,
					}),
				);

			lineCount++;
			if (lineCount % 10000 === 0) {
				console.log(`Đã đọc ${lineCount} dòng...`);
			}
		}

		await this.insertInChunks(batch);
		console.log(`Hoàn tất import ${batch.length} records.`);
	}

	private async insertInChunks(batch: Artist[]) {
		const CHUNK_SIZE = 5000;
		for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
			const chunk = batch.slice(i, i + CHUNK_SIZE);
			await this.artistRepo.save(chunk);
			console.log(
				`Inserted ${i + chunk.length}/${batch.length} records...`,
			);
		}
	}

	//create
	async exportAdaArtists(cookie: string, authorization: string) {
		const fields = [
			'id',
			'labelId',
			'name',
			'displayName',
			'legalName',
			'gcdmId',
			'nameId',
			'partyId',
			'artistType',
			'artistNameFormat',
			'artistNameFormatGcdmId',
			'originCountry',
			'originCountryGcdmId',
			'locale',
			'primaryGenre',
			'primaryGenreGcdmId',
			'isni',
			'isActive',
			'isDeleted',
			'createdBy',
			'updatedBy',
			'createdAt',
			'updatedAt',
		];

		const parser = new Parser({ fields });
		const dir = path.join(process.cwd(), 'exports');
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const take = 1000;
		let skip = 0;
		let total = 0;
		let batchResults: any[] = [];
		let fileIndex = 1;

		do {
			const data = await this.fetchAdaArtistsBatch(
				cookie,
				authorization,
				take,
				skip,
			);

			const artists = data.data || [];
			total = data.total ?? 800000;

			this.logger.log(
				`Fetched batch: skip=${skip}, got=${artists.length}, total=${total}`,
			);

			batchResults.push(...artists);
			skip += take;

			// Export mỗi 10k records
			if (batchResults.length >= 100000) {
				const csv = parser.parse(batchResults);
				const filePath = path.join(
					dir,
					`ada_artists_part_${fileIndex}.csv`,
				);
				fs.writeFileSync(filePath, csv, 'utf8');

				this.logger.log(`Exported file: ${filePath}`);

				fileIndex++;
				batchResults = [];
			}

			await new Promise((resolve) => setTimeout(resolve, 200));
		} while (skip < total);

		// Export phần còn lại
		if (batchResults.length > 0) {
			const csv = parser.parse(batchResults);
			const filePath = path.join(
				dir,
				`ada_artists_part_${fileIndex}.csv`,
			);
			fs.writeFileSync(filePath, csv, 'utf8');
			this.logger.log(`Exported file: ${filePath}`);
		}

		return dir;
	}

	async getAdaArtistByName(
		cookie: string,
		authorization: string,
		name: string,
	) {
		const url = `https://partners.ada-music.com/api/coop/releases/parties/find-by-name?showRelated=false&query=${encodeURIComponent(
			name,
		)}`;

		try {
			const res = await firstValueFrom(
				this.httpService.get(url, {
					headers: {
						Authorization: authorization,
						Cookie: cookie,
						'x-no-gzip-response': 'true',
					},
				}),
			);

			return res.data?.data ?? res.data ?? [];
		} catch (err) {
			this.logger.error(
				`Error fetching ADA artist: ${name}`,
				err.message,
			);
			return [];
		}
	}

	async exportArtistsWithProfiles(
		cookie: string,
		authorization: string,
		query?: string,
		batchSize = 5000,
		concurrency = 25,
	) {
		let offset = 0;
		let totalUpdated = 0;
		const limit = pLimit(concurrency);

		while (true) {
			const artists = await this.artistRepo.find({
				where: {
					idSource: Not(IsNull()),
					artistSource: ArtistSource.ADA,
					isScanned: false,
					...(query ? { name: ILike(`%${query}%`) } : {}),
				},
				order: { name: 'ASC' },
				skip: offset,
				take: batchSize,
			});

			if (artists.length === 0) break;
			this.logger.log(`Retrieved ${artists.length} artists from DB`);

			const processed = new Set<string>();

			const tasks = artists.map((artist) =>
				limit(async () => {
					if (processed.has(artist.idSource)) return null;

					const adaArtists = await this.getAdaArtistByName(
						cookie,
						authorization,
						artist.name,
					);

					this.logger.debug(
						`Found ${adaArtists.length} ADA artists for: ${artist.name}`,
					);

					const updates: Partial<Artist>[] = [];

					for (const ada of adaArtists) {
						const source = ada.artist ?? ada.participant;
						const idSource = String(
							ada.artist?.id || ada.participant?.id,
						);

						const match = artists.find(
							(a) => String(a.idSource) === idSource,
						);
						if (match && !processed.has(idSource)) {
							updates.push({
								id: match.id,
								primaryGenre: source?.primaryGenre || null,
								originCountry: source?.originCountry || null,
								isScanned: true,
							});
							processed.add(idSource);
						}
					}

					return updates;
				}),
			);

			const settled = await Promise.allSettled(tasks);

			const updates: Partial<Artist>[] = [];
			for (const s of settled) {
				if (s.status === 'fulfilled' && s.value) {
					updates.push(...s.value);
				}
			}

			if (updates.length > 0) {
				this.logger.log(`Updating ${updates.length} artists in DB...`);
				await this.artistRepo.save(updates, { chunk: 1000 });
				totalUpdated += updates.length;
			}

			offset += batchSize;
		}

		this.logger.log(`Export completed. Total updated: ${totalUpdated}`);
		return { message: `Export completed. Total updated: ${totalUpdated}` };
	}

	private writeCsvFile(records: any[], index: number): string {
		const fields = [
			'id',
			'name',
			'idSource',
			'spotify_id',
			'apple_music_id',
		];
		const parser = new Parser({ fields });
		const csv = parser.parse(records);

		const filePath = `artists_with_profiles_part${index}_${Date.now()}.csv`;
		fs.writeFileSync(filePath, csv);

		console.log(`   ➤ Wrote file: ${filePath} (${records.length} records)`);

		return filePath;
	}

	private async fetchAdaArtistsBatch(
		cookie: string,
		authorization: string,
		take: number,
		skip: number,
	) {
		const url = 'https://partners.ada-music.com/api/coop/releases/artists';

		const res = await firstValueFrom(
			this.httpService.get(url, {
				headers: {
					Authorization: authorization,
					Cookie: cookie,
					'x-no-gzip-response': 'true',
				},
				params: {
					take,
					skip,
					showRelated: true,
				},
			}),
		);

		return res.data;
	}

	private async processAdaArtistsBatch(artists: any[]) {
		return Promise.all(
			artists.map(async (item: any) => {
				const exists = await this.checkExists({
					idSource: item.id,
					artistSource: ArtistSource.ADA,
				});

				if (!exists) {
					this.logger.log(
						`Creating new artist from ADA: ID=${item.id}, Name=${item.name}`,
					);

					// return this.createSafe({
					// 	name: item.name,
					// 	artistSource: ArtistSource.ADA,
					// 	idSource: item.id,
					// });
				}
			}),
		);
	}

	private async getArtistsByCountry(country: string) {
		const limit = 100;
		let offset = 0;
		let total = 0;
		let fetched = 0;
		const result: { id: string; name: string }[] = [];

		do {
			const url = `https://musicbrainz.org/ws/2/artist?query=country:${country}&limit=${limit}&offset=${offset}&fmt=json`;

			const res = await firstValueFrom(
				this.httpService.get(url, {
					headers: {
						'User-Agent': 'MyMusicApp/1.0 (myemail@example.com)',
					},
				}),
			);

			const data = res.data;
			if (offset === 0) {
				total = data.count;
				this.logger.log(`Total artists in ${country}: ${total}`);
			}

			const artists = data.artists || [];
			artists.forEach((artist: any) => {
				result.push({ id: artist.id, name: artist.name });
			});

			fetched += artists.length;
			offset += limit;

			this.logger.log(
				`Fetched ${fetched}/${total} artists for ${country} | Result size: ${(Buffer.byteLength(JSON.stringify(result)) / 1024 / 1024).toFixed(2)} MB`,
			);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		} while (fetched < total);

		return result;
	}

	private async getCountryIsoCodes(): Promise<string[]> {
		const BASE_URL = 'https://musicbrainz.org/ws/2';
		const limit = 100;
		let offset = 0;
		const results: string[] = [];
		let total = 0;

		const fetchData = async <T>(url: string): Promise<T> => {
			const res = await firstValueFrom(
				this.httpService.get<T>(url, {
					headers: {
						'User-Agent': 'MyApp/1.0 (myemail@example.com)',
					},
				}),
			);
			return res.data;
		};

		do {
			const url = `${BASE_URL}/area?query=type:country&limit=${limit}&offset=${offset}&fmt=json`;
			const data = await fetchData<any>(url);

			total = data.count;
			const isoCodes = data.areas
				.filter((a: any) => a['iso-3166-1-codes']?.length)
				.map((a: any) => a['iso-3166-1-codes'][0]);

			results.push(...isoCodes);
			offset += limit;

			this.logger.log(`Fetched ${results.length}/${total}`);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		} while (offset < total);

		return results;
	}

	private async artistsFromMb() {
		const listIsoCodes = await this.getCountryIsoCodes();

		for (const iso of listIsoCodes) {
			const start = Date.now();
			const artists = await this.getArtistsByCountry(iso);

			await Promise.all(
				artists.map(async (item) => {
					const exists = await this.checkExists({
						idSource: item.id,
						artistSource: ArtistSource.MUSIC_BRAINZ,
					});

					if (!exists) {
						const result = await this.artistService.create({
							name: item.name,
							artistSource: ArtistSource.MUSIC_BRAINZ,
							idSource: item.id,
						});
						this.logger.log(result);
					}
				}),
			);

			const elapsed = Date.now() - start;
			const delay = Math.max(0, 1000 - elapsed);

			if (delay > 0) {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		return { message: 'Import completed' };
	}

	async countArtistsFromMb() {
		const listIsoCodes = await this.getCountryIsoCodes();

		const countryStats: Record<string, number> = {};
		let globalTotal = 0;

		for (const iso of listIsoCodes) {
			const url = `https://musicbrainz.org/ws/2/artist?query=country:${iso}&limit=1&offset=0&fmt=json`;

			const res = await firstValueFrom(
				this.httpService.get<any>(url, {
					headers: {
						'User-Agent': 'MyApp/1.0 (myemail@example.com)',
					},
				}),
			);

			const total = res.data.count || 0;

			countryStats[iso] = total;
			globalTotal += total;

			this.logger.log(`Country ${iso} → total=${total}`);

			// tránh bị rate-limit
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		return {
			message: 'Count completed',
			totalArtistsAllCountries: globalTotal,
			byCountry: countryStats,
		};
	}

	async checkExists(data: { artistSource: ArtistSource; idSource: string }) {
		return this.artistRepo.exists({ where: data });
	}

	async importAdaArtists() {
		const dir = path.join(process.cwd(), 'exports');

		if (!fs.existsSync(dir)) {
			throw new Error(`Directory not found: ${dir}`);
		}

		const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv'));

		this.logger.log(`Found ${files.length} CSV files`);

		const allRecords: any[] = [];

		for (const file of files) {
			const filePath = path.join(dir, file);
			const content = fs.readFileSync(filePath, 'utf8');

			// parse CSV thành object
			const records: any = parse(content, {
				columns: true,
				skip_empty_lines: true,
			});

			const chunkSize = 500;
			for (let i = 0; i < records.length; i += chunkSize) {
				const chunk = records.slice(i, i + chunkSize);

				await Promise.all(
					chunk.map((item: any) =>
						this.artistService
							.createSafe({
								name: item.name,
								idSource: item.id,
								artistSource: ArtistSource.ADA,
							})
							.then(() => {
								this.logger.log(
									`Imported artist from ADA → id=${item.id}, name="${item.name}"`,
								);
							}),
					),
				);

				this.logger.log(`Imported chunk ${i / chunkSize + 1}`);
			}
			this.logger.log(`Imported ${records.length} rows from ${file}`);

			allRecords.push(...records);
		}

		return {
			totalFiles: files.length,
			totalRows: allRecords.length,
			sample: allRecords.slice(0, 10),
		};
	}
}
