import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { VideoArtistMessages } from '../constants/video-artist.constant';
import {
	BulkCreateVideoArtistDto,
	CreateVideoArtistDto,
	QueryGetListVideoArtistDto,
	UpdateVideoArtistDto,
} from '../dto/video-artist.dto';
import { VideoArtist } from '../entities/video-artist.entity';
import { VideoArtistValidateService } from './video-artist.validate.service';

@Injectable()
export class VideoArtistService {
	private readonly logger = new Logger(VideoArtistService.name);

	constructor(
		@InjectRepository(VideoArtist)
		private readonly videoArtistRepo: Repository<VideoArtist>,

		private readonly videoArtistValidateService: VideoArtistValidateService,
	) {}

	async create(data: CreateVideoArtistDto): Promise<VideoArtist> {
		const videoArtist = this.videoArtistRepo.create(data);
		await this.videoArtistValidateService.handleValidateCreate(videoArtist);
		return this.videoArtistRepo.save(videoArtist);
	}

	async createSafe(data: CreateVideoArtistDto): Promise<VideoArtist | null> {
		try {
			return await this.create(data);
		} catch (error: any) {
			this.logger.warn(
				`Skip create video artist, reason: ${error.message}`,
			);
			return null;
		}
	}

	async bulkCreate(data: BulkCreateVideoArtistDto): Promise<VideoArtist[]> {
		const results = await Promise.all(
			data.items.map((item) => this.createSafe(item)),
		);
		return results.filter((item): item is VideoArtist => item !== null);
	}

	async findOne(id: string): Promise<VideoArtist> {
		const videoArtist = await this.videoArtistRepo.findOne({
			where: { id },
			relations: {
				artist: true,
				video: true,
			},
		});

		if (!videoArtist) {
			throw new ResponseError(VideoArtistMessages.NOT_FOUND);
		}

		return videoArtist;
	}

	async getList(
		query: QueryGetListVideoArtistDto,
	): Promise<PageDto<VideoArtist>> {
		const { page, pageSize, skip, videoId } = query;

		const [items, totalItems] = await this.videoArtistRepo.findAndCount({
			where: {
				...(videoId ? { videoId } : {}),
			},
			relations: {
				artist: true,
			},
			skip,
			take: pageSize,
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

	async update(id: string, data: UpdateVideoArtistDto): Promise<VideoArtist> {
		const previous = await this.findOne(id);
		const updated = Object.assign({}, previous, data);

		await this.videoArtistValidateService.handleValidateUpdate({
			videoArtistPrevious: previous,
			videoArtistUpdate: updated,
		});

		await this.videoArtistRepo.save(updated);

		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		await this.videoArtistRepo.delete(id);
	}

	async deleteRecordOfVideo({ videoId }: { videoId: string }): Promise<void> {
		await this.videoArtistRepo.delete({ videoId });
	}
}
