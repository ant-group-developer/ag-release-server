import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	CreateVideoDto,
	UpdateVideoDto,
	UpsertReleaseVideoDto,
} from './dto/video.dto';
import { Video } from './entities/video.entity';

@Injectable()
export class VideoService {
	constructor(
		@InjectRepository(Video)
		private readonly videoRepo: Repository<Video>,
	) {}

	async create(dto: CreateVideoDto) {
		const video = this.videoRepo.create(dto);
		return this.videoRepo.save(video);
	}

	async upsertByReleaseId(releaseId: string, dto: UpsertReleaseVideoDto) {
		const video = await this.videoRepo.findOne({
			where: { releaseId },
		});

		if (!video) {
			return this.videoRepo.save(
				this.videoRepo.create({
					...dto,
					releaseId,
				}),
			);
		}

		Object.assign(video, {
			...dto,
			releaseId,
		});

		return this.videoRepo.save(video);
	}

	async deleteRecordOfRelease({ releaseId }: { releaseId: string }) {
		await this.videoRepo.delete({ releaseId });
	}

	async findAll() {
		return this.videoRepo.find({
			relations: {
				release: true,
				videoFile: true,
				videoArtists: {
					artist: true,
				},
				videoContributors: {
					artist: true,
					artistRole: true,
				},
			},
			order: {
				createdAt: 'DESC',
			},
		});
	}

	async findOne(id: string) {
		const video = await this.videoRepo.findOne({
			where: { id },
			relations: {
				release: true,
				videoFile: true,
				videoArtists: {
					artist: true,
				},
				videoContributors: {
					artist: true,
					artistRole: true,
				},
			},
		});

		if (!video) {
			throw new NotFoundException('Video not found');
		}

		return video;
	}

	async findByReleaseId(releaseId: string) {
		const video = await this.videoRepo.findOne({
			where: { releaseId },
			relations: {
				release: true,
				videoFile: true,
				videoArtists: {
					artist: true,
				},
				videoContributors: {
					artist: true,
					artistRole: true,
				},
			},
		});

		if (!video) {
			throw new NotFoundException('Video not found');
		}

		return video;
	}

	async update(id: string, dto: UpdateVideoDto) {
		const video = await this.findOne(id);

		Object.assign(video, dto);

		return this.videoRepo.save(video);
	}

	async remove(id: string) {
		const video = await this.findOne(id);
		await this.videoRepo.remove(video);

		return {
			success: true,
		};
	}
}
