import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Channel } from 'src/modules/channel/entities/channel.entity';
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

		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
	) {}

	async create(dto: CreateVideoDto) {
		await this.ensureChannel(dto.channelId);
		const video = this.videoRepo.create(dto);
		return this.videoRepo.save(video);
	}

	async upsertByReleaseId(releaseId: string, dto: UpsertReleaseVideoDto) {
		await this.ensureChannel(dto.channelId);

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
				channel: true,
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
				channel: true,
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
				channel: true,
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
		await this.ensureChannel(dto.channelId);
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

	private async ensureChannel(channelId?: string | null) {
		if (!channelId) return;

		const exists = await this.channelRepo.exists({
			where: { id: channelId },
		});

		if (!exists) {
			throw new NotFoundException('Channel not found');
		}
	}
}
