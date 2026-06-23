import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';

import { VideoGenreException } from '../constants/video-genre.res';
import {
	BulkCreateVideoGenreDto,
	CreateVideoGenreDto,
	QueryGetListVideoGenreDto,
	UpdateVideoGenreDto,
} from '../dto/video-genre.dto';
import { VideoGenre } from '../entities/video-genre.entity';

@Injectable()
export class VideoGenreService {
	private readonly logger = new Logger(VideoGenreService.name);

	constructor(
		@InjectRepository(VideoGenre)
		private readonly videoGenreRepo: Repository<VideoGenre>,
	) {}

	async create(data: CreateVideoGenreDto): Promise<VideoGenre> {
		const videoGenre = this.videoGenreRepo.create(data);
		return await this.videoGenreRepo.save(videoGenre);
	}

	async createSafe(data: CreateVideoGenreDto): Promise<VideoGenre | null> {
		try {
			return await this.create(data);
		} catch (error: any) {
			this.logger.warn(
				`Skip create video genre, reason: ${error.message}`,
			);
			return null;
		}
	}

	async bulkCreate(data: BulkCreateVideoGenreDto): Promise<VideoGenre[]> {
		const results = await Promise.all(
			data.items.map((item) => this.createSafe(item)),
		);
		return results.filter((item): item is VideoGenre => item !== null);
	}

	async findOne(id: string): Promise<VideoGenre> {
		const videoGenre = await this.videoGenreRepo.findOne({
			where: { id },
			relations: ['video', 'genre'],
		});

		if (!videoGenre) {
			throw VideoGenreException.NOT_FOUND();
		}

		return videoGenre;
	}

	async getList(
		query: QueryGetListVideoGenreDto,
	): Promise<PageDto<VideoGenre>> {
		const { page, pageSize, skip } = query;

		const [items, totalItems] = await this.videoGenreRepo.findAndCount({
			skip,
			take: pageSize,
			relations: ['video', 'genre'],
		});

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getByVideoId(videoId: string): Promise<VideoGenre[]> {
		return await this.videoGenreRepo.find({
			where: { videoId },
			relations: ['genre'],
		});
	}

	async update(
		id: string,
		dataUpdate: UpdateVideoGenreDto,
	): Promise<VideoGenre> {
		const videoGenre = await this.findOne(id);
		const updated = Object.assign({}, videoGenre, dataUpdate);
		await this.videoGenreRepo.save(updated);
		return await this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		await this.videoGenreRepo.delete(id);
	}

	async deleteSafe(id: string): Promise<void> {
		await this.videoGenreRepo
			.delete(id)
			.catch((e) =>
				this.logger.warn(`Skip delete, reason: ${e.message}`),
			);
	}

	async deleteByVideoId(videoId: string): Promise<void> {
		await this.videoGenreRepo.delete({ videoId });
	}

	async handleDelete(id: string): Promise<void> {
		await this.deleteSafe(id);
	}
}
