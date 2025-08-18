import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import { GenreMessageError } from '../constants/genre.constant';
import {
	CreateGenreDto,
	QueryGetListGenreDto,
	UpdateGenreDto,
} from '../dto/genre.dto';
import { Genre } from '../entities/genre.entity';
import { GenreQueryService } from './genre.query.service';

@Injectable()
export class GenreService {
	constructor(
		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		private readonly bucketService: BucketService,
		private readonly genreQueryService: GenreQueryService,
	) {}

	// create
	async create(data: CreateGenreDto): Promise<Genre> {
		const { name, code } = data;
		await this.genreQueryService.validate({ name, code });

		const genre = this.genreRepo.create(data);
		return await this.genreRepo.save(genre);
	}

	// read
	async findOne(id: string): Promise<Genre> {
		const genre = await this.genreRepo.findOne({ where: { id } });
		if (!genre) {
			throw new ResponseError({
				message: GenreMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return genre;
	}

	async findOneWithCountRelation(id: string): Promise<Genre> {
		const genre = await this.genreQueryService.findOneWithCountRelation(id);

		if (!genre) {
			throw new ResponseError({
				message: GenreMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return genre;
	}

	async getList(query: QueryGetListGenreDto): Promise<PageDto<Genre>> {
		const { page, pageSize } = query;

		const queryGetList = this.genreQueryService.createQueryGetList(query);

		const [genres, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: genres,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	// update
	async update(id: string, updateGenreDto: UpdateGenreDto): Promise<Genre> {
		const { name, code, picture } = updateGenreDto;
		const genre = await this.findOne(id);

		if (name && name !== genre.name) {
			await this.genreQueryService.validate({ name });
		}

		if (code && code !== genre.code) {
			await this.genreQueryService.validate({ code });
		}

		if (
			picture !== undefined &&
			picture !== genre.picture &&
			genre.picture
		) {
			await this.bucketService.deletePublicFile(genre.picture);
		}

		await this.genreRepo.update(id, updateGenreDto);
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const genre = await this.findOneWithCountRelation(id);
		this.genreQueryService.validateDelete(genre);

		if (genre.picture)
			await this.bucketService.deletePublicFile(genre.picture);
		await this.genreRepo.delete(id);
	}
}
