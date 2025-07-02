import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { BucketGcsService } from 'src/modules/bucket/services/bucket.gcs.service';
import { Repository } from 'typeorm';
import {
	ArtistMessageCodeError,
	ArtistMessageError,
} from '../constants/artist.constant';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';

@Injectable()
export class ArtistService {
	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		private readonly bucketGcsService: BucketGcsService,
	) {}

	async create(createArtistDto: CreateArtistDto): Promise<Artist> {
		const { name } = createArtistDto;
		await this.validate({ name });

		const artist = this.artistRepo.create(createArtistDto);
		return await this.artistRepo.save(artist);
	}

	async findOne(id: string): Promise<Artist> {
		const artist = await this.artistRepo.findOne({ where: { id } });
		if (!artist) {
			throw new ResponseError({
				message: ArtistMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return artist;
	}

	async getList(query: QueryGetListArtistDto): Promise<PageDto<Artist>> {
		const { page, pageSize, skip, orderBy, fieldOrder } = query;

		const [artists, totalItems] = await this.artistRepo.findAndCount({
			skip,
			take: pageSize,
			order: {
				[fieldOrder]: orderBy,
			},
		});

		return new PageDto({
			items: artists,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateArtistDto: UpdateArtistDto,
	): Promise<Artist> {
		const { name, picture } = updateArtistDto;

		const artist = await this.findOne(id);

		if (name && name !== artist.name) {
			await this.validate({ name });
		}

		if (
			picture !== undefined &&
			picture !== artist.picture &&
			artist.picture
		) {
			await this.bucketGcsService.deletePublicFile(artist.picture);
		}

		await this.artistRepo.update(id, updateArtistDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		const artist = await this.findOne(id);
		if (artist.picture)
			await this.bucketGcsService.deletePublicFile(artist.picture);
		await this.artistRepo.delete(id);
	}

	async validate({ name }: { name: string }) {
		const artist = await this.artistRepo.findOne({
			where: { name },
		});

		if (artist) {
			throw new ResponseError({
				message: ArtistMessageError.DUPLICATE_NAME_ARTIST,
				messageCode: ArtistMessageCodeError.DUPLICATE_NAME_ARTIST,
				statusCode: 409,
			});
		}
	}
}
