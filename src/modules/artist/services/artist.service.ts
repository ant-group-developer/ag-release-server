import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { ArtistProfileService } from 'src/modules/artist-profile/artist-profile.service';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { In, Repository } from 'typeorm';
import { ArtistMessage } from '../constants/artist.constant';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';
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
	) {}

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

	async createSafe(data: ICreateArtist) {
		try {
			return await this.create(data);
		} catch (error) {
			this.logger.error(error?.message);
		}
	}

	async create(data: ICreateArtist): Promise<Artist> {
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
		const { page, pageSize, idInclude } = query;

		const artistsInclude = await this.artistRepo.find({
			where: { id: In(idInclude ?? []) },
		});

		const { artists, totalItems } =
			await this.artistQueryService.getListSimple(query);

		let finalArtists = artists;

		if (artistsInclude.length > 0) {
			const includeIds = new Set(artistsInclude.map((a) => a.id));

			const artistsFiltered = artists.filter(
				(a) => !includeIds.has(a.id),
			);

			const mergedArtists = [...artistsInclude, ...artistsFiltered];

			finalArtists = mergedArtists.slice(0, pageSize);
		}

		return new PageDto({
			items: finalArtists,
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
