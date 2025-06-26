import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateGenreDto,
	QueryGetListGenreDto,
	UpdateGenreDto,
} from './dto/genre.dto';
import { Genre } from './entities/genre.entity';

@Injectable()
export class GenreService {
	constructor(
		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,
	) {}

	async create(createGenreDto: CreateGenreDto): Promise<Genre> {
		const genre = this.genreRepo.create(createGenreDto);
		return await this.genreRepo.save(genre);
	}

	async findOne(id: string): Promise<Genre> {
		const genre = await this.genreRepo.findOne({ where: { id } });
		if (!genre) {
			throw new BadRequestException('Not found');
		}

		return genre;
	}

	async getList(query: QueryGetListGenreDto): Promise<PageDto<Genre>> {
		const { page, pageSize, skip } = query;

		const [genres, totalItems] = await this.genreRepo.findAndCount({
			skip,
			take: pageSize,
		});

		return new PageDto({
			items: genres,
			metaData: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, updateGenreDto: UpdateGenreDto): Promise<Genre> {
		await this.genreRepo.update(id, updateGenreDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.genreRepo.delete(id);
	}
}
