import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { IsrcService } from 'src/modules/external/isrc/isrc.service';
import { ReleaseLogService } from 'src/modules/release/modules/release-log/services/release-log.service';
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

		private readonly isrcService: IsrcService,
		private readonly appConfigService: AppConfigService,
		private readonly releaseLogService: ReleaseLogService,
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
				release: {
					releaseArtists: {
						artist: true,
					},
					label: true,
				},
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

	async genISRC(videoId: string) {
		// return 'QT6KL2614737';
		const video = await this.findOne(videoId);

		if (video.isrc) return video.isrc;

		const mainArtistName =
			video.release?.releaseArtists?.[0]?.artist?.name ?? '';

		if (!mainArtistName) {
			this.releaseLogService.failed({
				releaseId: video.releaseId,
				step: 'genISRC',
				message: 'Video thiếu thông tin nghệ sĩ',
			});

			throw new ResponseError({
				message: 'Video thiếu thông tin nghệ sĩ',
			});
		}

		const registrantName =
			video.label?.trim() || video.release?.label?.name || '';
		if (!registrantName) {
			this.releaseLogService.failed({
				releaseId: video.releaseId,
				step: 'genISRC',
				message: 'Thiếu thông tin registrantName (label)',
			});

			throw new ResponseError({
				message: 'Thiếu thông tin registrantName (label)',
			});
		}

		const prefixIsrcId =
			this.appConfigService.cache.config.generator.prefixIsrcDefaultId;

		if (!prefixIsrcId) {
			this.releaseLogService.failed({
				releaseId: video.releaseId,
				step: 'genISRC',
				message: 'Chưa cấu hình prefixIsrcId',
			});

			throw new ResponseError({
				message: 'Chưa cấu hình prefixIsrcId',
			});
		}

		const res = await this.isrcService.create({
			registrantName,
			recordingArtist: mainArtistName,
			recordingTitle: video.release?.title ?? 'Video',
			versionTitle: video.release?.version?.trim()
				? video.release.version
				: 'Original Version',
			assetType: 'VIDEO',
			immersive: false,
			explicit: !!video.explicit,
			yearOfProduction:
				video.release?.pLineYear ?? new Date().getUTCFullYear(),
			duration: 0,
			isAdded: false,
			prefixIsrcId,
		});

		const newIsrc = res.data.code;
		if (!newIsrc) {
			this.releaseLogService.failed({
				releaseId: video.releaseId,
				step: 'genISRC',
				message: 'Service ISRC không trả về mã ISRC',
			});

			throw new ResponseError({
				message: 'Service ISRC không trả về mã ISRC',
			});
		}

		await this.update(videoId, { isrc: newIsrc });

		return newIsrc;
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
