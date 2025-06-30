import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';
import { ArtistValidateService } from './artist.validate.service';

@Injectable()
export class ArtistService {
	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		private readonly artistValidateService: ArtistValidateService,
	) {}

	async create(createArtistDto: CreateArtistDto): Promise<Artist> {
		const { name } = createArtistDto;
		await this.artistValidateService.validate({ name });

		const artist = this.artistRepo.create(createArtistDto);
		return await this.artistRepo.save(artist);
	}

	async findOne(id: string): Promise<Artist> {
		const artist = await this.artistRepo.findOne({ where: { id } });
		if (!artist) {
			throw new BadRequestException('Not found');
		}

		return artist;
	}

	async getList(query: QueryGetListArtistDto): Promise<PageDto<Artist>> {
		const { page, pageSize, skip } = query;

		const [artists, totalItems] = await this.artistRepo.findAndCount({
			skip,
			take: pageSize,
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
		const { name } = updateArtistDto;

		if (name) {
			await this.artistValidateService.validate({ name });
		}

		await this.artistRepo.update(id, updateArtistDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.artistRepo.delete(id);
	}
}
