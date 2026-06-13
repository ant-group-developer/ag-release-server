import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { VideoContributorException } from '../constants/video-contributor.exception';
import {
	BulkCreateVideoContributorDto,
	CreateVideoContributorDto,
	QueryGetListVideoContributorDto,
	UpdateVideoContributorDto,
} from '../dto/video-contributor.dto';
import { VideoContributor } from '../entities/video-contributor.entity';
import { VideoContributorValidateService } from './video-contributor.validate.service';

@Injectable()
export class VideoContributorService {
	private readonly logger = new Logger(VideoContributorService.name);

	constructor(
		@InjectRepository(VideoContributor)
		private readonly videoContributorRepo: Repository<VideoContributor>,

		private readonly videoContributorValidateService: VideoContributorValidateService,
	) {}

	async create(data: CreateVideoContributorDto): Promise<VideoContributor> {
		const videoContributor = this.videoContributorRepo.create(data);

		await this.videoContributorValidateService.handleValidateCreate(
			videoContributor,
		);

		return this.videoContributorRepo.save(videoContributor);
	}

	async createSafe(
		data: CreateVideoContributorDto,
	): Promise<VideoContributor | null> {
		try {
			return await this.create(data);
		} catch (error: any) {
			this.logger.warn(
				`Skip create video contributor, reason: ${error.message}`,
			);
			return null;
		}
	}

	async bulkCreate(
		data: BulkCreateVideoContributorDto,
	): Promise<VideoContributor[]> {
		const results = await Promise.all(
			data.items.map((item) => this.createSafe(item)),
		);
		return results.filter(
			(item): item is VideoContributor => item !== null,
		);
	}

	async findOne(id: string): Promise<VideoContributor> {
		const contributor = await this.videoContributorRepo.findOne({
			where: { id },
			relations: {
				artist: true,
				artistRole: true,
				video: true,
			},
		});

		if (!contributor) {
			throw VideoContributorException.NOT_FOUND();
		}

		return contributor;
	}

	async getList(
		query: QueryGetListVideoContributorDto,
	): Promise<PageDto<VideoContributor>> {
		const { page, pageSize, skip, videoId } = query;

		const [items, totalItems] =
			await this.videoContributorRepo.findAndCount({
				where: {
					...(videoId ? { videoId } : {}),
				},
				relations: {
					artist: true,
					artistRole: true,
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

	async update(
		id: string,
		data: UpdateVideoContributorDto,
	): Promise<VideoContributor> {
		const previous = await this.findOne(id);
		const updated = Object.assign({}, previous, data);

		await this.videoContributorValidateService.handleValidateUpdate({
			videoContributorPrevious: previous,
			videoContributorUpdate: updated,
		});

		await this.videoContributorRepo.save(updated);

		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		await this.videoContributorRepo.delete(id);
	}

	async deleteRecordOfVideo({ videoId }: { videoId: string }): Promise<void> {
		await this.videoContributorRepo.delete({ videoId });
	}
}
