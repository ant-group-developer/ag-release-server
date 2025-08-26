import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { ArtistProfileService } from 'src/modules/artist-profile/artist-profile.service';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import { ArtistMessageError } from '../constants/artist.constant';
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
	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		private readonly bucketService: BucketService,
		private readonly artistQueryService: ArtistQueryService,

		private readonly artistProfileService: ArtistProfileService,
	) {}

	//create
	async handleCreate(data: CreateArtistDto) {
		const { artistProfiles, ...restOfData } = data;

		const artist = await this.create(restOfData);

		artist.artistProfiles = await this.createArtistProfile({
			artistId: artist.id,
			artistProfiles,
		});

		return artist;
	}

	private async create(data: ICreateArtist): Promise<Artist> {
		const { name } = data;
		await this.artistQueryService.validate({ name });

		const artist = this.artistRepo.create(data);
		return await this.artistRepo.save(artist);
	}

	private async createArtistProfile({
		artistId,
		artistProfiles,
	}: {
		artistId: string;
		artistProfiles: CreateArtistDto['artistProfiles'];
	}) {
		return artistProfiles && artistProfiles.length > 0
			? await this.artistProfileService.bulkCreate(
					artistProfiles.map((item) => ({
						...item,
						artistId,
					})),
				)
			: [];
	}

	// read
	private async findOne(id: string): Promise<Artist> {
		const artist = await this.artistRepo.findOne({ where: { id } });
		if (!artist) {
			throw new ResponseError({
				message: ArtistMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return artist;
	}

	private async findOneWithCountRelation(id: string): Promise<Artist> {
		const artist =
			await this.artistQueryService.findOneWithCountRelation(id);
		if (!artist) {
			throw new ResponseError({
				message: ArtistMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return artist;
	}

	async findOneLite(id: string) {
		const artist = await this.artistQueryService.findOneLite(id);

		if (!artist) {
			throw new ResponseError({
				message: ArtistMessageError.NOT_FOUND,
				statusCode: 404,
			});
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

	// update
	async handleUpdate(id: string, data: UpdateArtistDto) {
		const { artistProfiles, ...restOfData } = data;

		await this.update(id, restOfData);

		await this.updateOrCreateArtistProfile({
			artistId: id,
			artistProfiles,
		});

		return await this.findOneLite(id);
	}

	private async update(id: string, data: UpdateArtistDto) {
		const { name, picture } = data;

		const artist = await this.findOne(id);

		if (name && name !== artist.name) {
			await this.artistQueryService.validate({ name });
		}

		if (
			picture !== undefined &&
			picture !== artist.picture &&
			artist.picture
		) {
			await this.bucketService.deletePublicFile(artist.picture);
		}

		await this.artistRepo.update(id, data);
	}

	private async updateOrCreateArtistProfile({
		artistId,
		artistProfiles,
	}: {
		artistId: string;
		artistProfiles: UpdateArtistDto['artistProfiles'];
	}) {
		const dataCreate = [];
		const dataUpdate = [];

		if (artistProfiles && artistProfiles.length > 0) {
			for (const item of artistProfiles) {
				if (!item.id) {
					dataCreate.push({ ...item, artistId });
				} else {
					dataUpdate.push({ id: item.id, ...item, artistId });
				}
			}
		}

		await this.artistProfileService.bulkCreate(dataCreate);
		await this.artistProfileService.bulkUpdate(dataUpdate);
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
