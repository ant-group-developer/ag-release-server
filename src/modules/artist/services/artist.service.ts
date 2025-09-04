import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { ArtistProfileService } from 'src/modules/artist-profile/artist-profile.service';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import { ArtistMessage } from '../constants/artist.constant';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';
import { ArtistSource } from '../enum/artist.enum';
import { ICreateArtist } from '../interfaces/artist.interface.';
import { ArtistQueryService } from './artist.query.service';

@Injectable()
export class ArtistService {
	private logger = new Logger(ArtistService.name);

	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		private readonly bucketService: BucketService,
		private readonly artistQueryService: ArtistQueryService,

		private readonly artistProfileService: ArtistProfileService,
		private readonly httpService: HttpService,
	) {}

	//create

	async artistFromAda(cookie: string, authorization: string) {
		const take = 1000;
		let skip = 0;
		let total = 0;
		const allResults: any[] = [];

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

			// await this.processAdaArtistsBatch(artists);

			allResults.push(...artists);
			skip += take;

			await new Promise((resolve) => setTimeout(resolve, 1000));
		} while (skip < total);

		return allResults;
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

					return this.createSafe({
						name: item.name,
						artistSource: ArtistSource.ADA,
						idSource: item.id,
					});
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
						const result = await this.create({
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

	async checkExists(data: { artistSource: ArtistSource; idSource: string }) {
		return this.artistRepo.exists({ where: data });
	}

	async handleCreate(data: CreateArtistDto, userId: string) {
		const { artistProfiles, ...restOfData } = data;

		const artist = await this.create({
			...restOfData,
			creatorId: userId,
			modifierId: userId,
		});

		artist.artistProfiles = await this.createArtistProfile({
			artistId: artist.id,
			artistProfiles,
			userId,
		});

		return artist;
	}

	private async createSafe(data: ICreateArtist) {
		try {
			return await this.create(data);
		} catch (error) {
			this.logger.error(error?.message);
		}
	}

	private async create(data: ICreateArtist): Promise<Artist> {
		const { name } = data;
		// await this.artistQueryService.validate({ name });
		const code = await this.artistQueryService.getCodeFromName(name);

		const artist = this.artistRepo.create({ ...data, code });
		return await this.artistRepo.save(artist);
	}

	private async createArtistProfile({
		artistId,
		artistProfiles,
		userId,
	}: {
		artistId: string;
		artistProfiles: CreateArtistDto['artistProfiles'];
		userId: string;
	}) {
		return artistProfiles && artistProfiles.length > 0
			? await this.artistProfileService.bulkCreate(
					artistProfiles.map((item) => ({
						...item,
						creatorId: userId,
						modifierId: userId,
						artistId,
					})),
				)
			: [];
	}

	// read
	private async findOne(id: string): Promise<Artist> {
		const artist = await this.artistRepo.findOne({ where: { id } });
		if (!artist) {
			throw new ResponseError(ArtistMessage.NOT_FOUND);
		}

		return artist;
	}

	private async findOneWithCountRelation(id: string): Promise<Artist> {
		const artist =
			await this.artistQueryService.findOneWithCountRelation(id);
		if (!artist) {
			throw new ResponseError(ArtistMessage.NOT_FOUND);
		}

		return artist;
	}

	async findOneLite(id: string) {
		const artist = await this.artistQueryService.findOneLite(id);

		if (!artist) {
			throw new ResponseError(ArtistMessage.NOT_FOUND);
		}
		return artist;
	}

	async getList(query: QueryGetListArtistDto): Promise<PageDto<Artist>> {
		const { page, pageSize } = query;

		const { artists, totalItems } =
			await this.artistQueryService.getList(query);

		return new PageDto({
			items: artists,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple(
		query: QueryGetListArtistDto,
	): Promise<PageDto<Artist>> {
		const { page, pageSize } = query;

		const { artists, totalItems } =
			await this.artistQueryService.getListSimple(query);

		return new PageDto({
			items: artists,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	// update
	async handleUpdate(id: string, data: UpdateArtistDto, userId: string) {
		const { artistProfiles, ...restOfData } = data;

		const artist = await this.findOneLite(id);

		await this.update(artist, restOfData, userId);

		await this.updateArtistProfile({
			artist,
			artistProfiles,
			userId,
		});

		return await this.findOneLite(id);
	}

	private async update(
		artist: Artist,
		data: UpdateArtistDto,
		userId: string,
	) {
		const { picture } = data;

		// if (name && name !== artist.name) {
		// 	await this.artistQueryService.validate({ name });
		// }

		if (
			picture !== undefined &&
			picture !== artist.picture &&
			artist.picture
		) {
			await this.bucketService.deletePublicFile(artist.picture);
		}

		await this.artistRepo.update(artist.id, {
			...data,
			modifierId: userId,
		});
	}

	private async updateArtistProfile({
		artist,
		artistProfiles,
		userId,
	}: {
		artist: Artist;
		artistProfiles: UpdateArtistDto['artistProfiles'];
		userId: string;
	}) {
		const { id: artistId, artistProfiles: artistProfilesDb } = artist;

		const dataCreate = [];
		const dataUpdate = [];

		if (artistProfiles && artistProfiles.length > 0) {
			for (const item of artistProfiles) {
				if (!item.id) {
					dataCreate.push({
						...item,
						artistId,
						creatorId: userId,
						modifierId: userId,
					});
				} else {
					dataUpdate.push({
						id: item.id,
						...item,
						artistId,
					});
				}
			}
		}

		const listUpdateIds = dataUpdate.map((item) => item.id);
		const listDbIds = artistProfilesDb.map((item) => item.id);

		const listDeleteIds = listDbIds.filter(
			(item) => !listUpdateIds.includes(item),
		);

		await Promise.all([
			this.artistProfileService.bulkCreate(dataCreate),
			this.artistProfileService.bulkUpdate(dataUpdate, userId),
			Promise.all(
				listDeleteIds.map((id) => this.deleteArtistProfile(id)),
			),
		]);
	}

	// delete
	async delete(id: string): Promise<void> {
		const artist = await this.findOneWithCountRelation(id);
		this.artistQueryService.validateDelete(artist);

		if (artist.picture)
			await this.bucketService.deletePublicFile(artist.picture);
		await this.artistRepo.delete(id);
	}

	async deleteArtistProfile(artistProfileId: string) {
		await this.artistProfileService.delete(artistProfileId);
	}
}
