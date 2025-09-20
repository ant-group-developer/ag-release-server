import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import { dataInitGenre, GenreMessage } from '../constants/genre.constant';
import {
	CreateGenreDto,
	QueryGetListGenreDto,
	UpdateGenreDto,
} from '../dto/genre.dto';
import { Genre } from '../entities/genre.entity';
import { GenreQueryService } from './genre.query.service';

@Injectable()
export class GenreService implements OnModuleInit {
	private readonly logger = new Logger(GenreService.name);
	constructor(
		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		private readonly bucketService: BucketService,
		private readonly genreQueryService: GenreQueryService,
	) {}

	async onModuleInit() {
		await this.initGenre();
	}

	private async initGenre() {
		const count = await this.genreRepo.count();

		if (count === 0) {
			this.logger.log('Initializing language');

			const insertData = this.genreRepo.create(dataInitGenre);
			await this.genreRepo.save(insertData);

			this.logger.log('Genres inserted successfully');
		} else {
			this.logger.log(
				'Genres table already has data, skipping initialization',
			);
		}
	}

	// create
	async create(data: CreateGenreDto, userId: string): Promise<Genre> {
		const { name, code } = data;
		await this.genreQueryService.validate({ name, code });

		const genre = this.genreRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.genreRepo.save(genre);
	}

	// read
	async findOne(id: string): Promise<Genre> {
		const genre = await this.genreRepo.findOne({ where: { id } });
		if (!genre) {
			throw new ResponseError(GenreMessage.NOT_FOUND);
		}

		return genre;
	}

	async findOneWithCountRelation(id: string): Promise<Genre> {
		const genre = await this.genreQueryService.findOneWithCountRelation(id);

		if (!genre) {
			throw new ResponseError(GenreMessage.NOT_FOUND);
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

	async getListSimple() {
		return this.genreQueryService.getListSimple();
	}

	// update
	async update(
		id: string,
		updateGenreDto: UpdateGenreDto,
		userId: string,
	): Promise<Genre> {
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

		await this.genreRepo.update(id, {
			...updateGenreDto,
			modifierId: userId,
		});
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
