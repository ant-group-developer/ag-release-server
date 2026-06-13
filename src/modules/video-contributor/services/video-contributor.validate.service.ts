import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { Repository } from 'typeorm';
import { VideoContributorException } from '../constants/video-contributor.exception';
import { VideoContributor } from '../entities/video-contributor.entity';

@Injectable()
export class VideoContributorValidateService {
	constructor(
		@InjectRepository(VideoContributor)
		private readonly repo: Repository<VideoContributor>,

		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		@InjectRepository(Video)
		private readonly videoRepo: Repository<Video>,
	) {}

	async handleValidateCreate(e: VideoContributor) {
		await this.validateForeignKey(e);
		await this.validateUnique(e);
	}

	async handleValidateUpdate({
		videoContributorPrevious,
		videoContributorUpdate,
	}: {
		videoContributorPrevious: VideoContributor;
		videoContributorUpdate: VideoContributor;
	}) {
		const { artistId, artistRoleId, videoId } = videoContributorUpdate;

		if (artistId !== videoContributorPrevious.artistId) {
			await this.validateForeignKey({ artistId });
			await this.validateUnique(videoContributorUpdate);
		}

		if (artistRoleId !== videoContributorPrevious.artistRoleId) {
			await this.validateForeignKey({ artistRoleId });
			await this.validateUnique(videoContributorUpdate);
		}

		if (videoId !== videoContributorPrevious.videoId) {
			await this.validateForeignKey({ videoId });
			await this.validateUnique(videoContributorUpdate);
		}
	}

	private async validateForeignKey({
		artistRoleId,
		artistId,
		videoId,
	}: {
		artistRoleId?: string;
		artistId?: string;
		videoId?: string;
	}) {
		if (
			artistRoleId &&
			!(await this.artistRoleRepo.findOne({
				where: { id: artistRoleId },
			}))
		) {
			throw new ResponseError({ message: 'Artist role not found' });
		}

		if (
			artistId &&
			!(await this.artistRepo.findOne({ where: { id: artistId } }))
		) {
			throw new ResponseError({ message: 'Artist not found' });
		}

		if (
			videoId &&
			!(await this.videoRepo.findOne({ where: { id: videoId } }))
		) {
			throw new ResponseError({ message: 'Video not found' });
		}
	}

	private async validateUnique({
		videoId,
		artistRoleId,
		artistId,
	}: VideoContributor) {
		const existed = await this.repo.findOne({
			where: {
				videoId,
				artistRoleId,
				artistId,
			},
		});

		if (existed) {
			throw VideoContributorException.UNIQUE_CONSTRAINT();
		}
	}
}
