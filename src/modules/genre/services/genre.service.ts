import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import {
	GenreMessageCodeError,
	GenreMessageError,
} from '../constants/genre.constant';
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

	async create(createGenreDto: CreateGenreDto): Promise<Genre> {
		await this.validate({ name: createGenreDto.name });

		const genre = this.genreRepo.create(createGenreDto);
		return await this.genreRepo.save(genre);
	}

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

	async update(id: string, updateGenreDto: UpdateGenreDto): Promise<Genre> {
		const { name, picture } = updateGenreDto;
		const genre = await this.findOne(id);

		if (name && name !== genre.name) {
			await this.validate({ name });
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

	async delete(id: string): Promise<void> {
		const genre = await this.genreQueryService.findOneWithCountRelation(id);

		if (!genre) {
			if (!genre) {
				throw new ResponseError({
					message: GenreMessageError.NOT_FOUND,
					statusCode: 404,
				});
			}
		}

		if ((genre.primaryGenreReleasesCount ?? 0) > 0) {
			throw new ResponseError({
				message: `Cannot delete this genre because it is linked to ${genre.primaryGenreReleasesCount} primary release(s).`,
				statusCode: 400,
			});
		}

		if ((genre.subGenreReleasesCount ?? 0) > 0) {
			throw new ResponseError({
				message: `Cannot delete this genre because it is linked to ${genre.subGenreReleasesCount} sub-genre release(s).`,
				statusCode: 400,
			});
		}

		if ((genre.primaryGenreTracksCount ?? 0) > 0) {
			throw new ResponseError({
				message: `Cannot delete this genre because it is linked to ${genre.primaryGenreTracksCount} primary track(s).`,
				statusCode: 400,
			});
		}

		if ((genre.subGenreTracksCount ?? 0) > 0) {
			throw new ResponseError({
				message: `Cannot delete this genre because it is linked to ${genre.subGenreTracksCount} sub-genre track(s).`,
				statusCode: 400,
			});
		}

		if (genre.picture)
			await this.bucketService.deletePublicFile(genre.picture);
		await this.genreRepo.delete(id);
	}

	async validate({ name }: { name?: string }) {
		const genre = await this.genreRepo.findOne({ where: { name } });

		if (genre) {
			throw new ResponseError({
				messageCode: GenreMessageCodeError.DUPLICATE_NAME_GENRE,
				message: GenreMessageError.DUPLICATE_NAME_GENRE,
			});
		}
	}
}
