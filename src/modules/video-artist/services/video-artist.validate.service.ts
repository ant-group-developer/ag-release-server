import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { Repository } from 'typeorm';
import { VideoArtistMessages } from '../constants/video-artist.constant';
import { VideoArtist } from '../entities/video-artist.entity';

@Injectable()
export class VideoArtistValidateService {
	constructor(
		@InjectRepository(VideoArtist)
		private readonly videoArtistRepo: Repository<VideoArtist>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		@InjectRepository(Video)
		private readonly videoRepo: Repository<Video>,
	) {}

	async handleValidateCreate(videoArtist: VideoArtist) {
		await this.validateForeignKey(videoArtist);
		await this.validateUnique(videoArtist);
	}

	async handleValidateUpdate({
		videoArtistPrevious,
		videoArtistUpdate,
	}: {
		videoArtistPrevious: VideoArtist;
		videoArtistUpdate: VideoArtist;
	}) {
		if (videoArtistUpdate.artistId !== videoArtistPrevious.artistId) {
			await this.validateForeignKey({
				artistId: videoArtistUpdate.artistId,
			});
			await this.validateUnique(videoArtistUpdate);
		}

		if (videoArtistUpdate.videoId !== videoArtistPrevious.videoId) {
			await this.validateForeignKey({
				videoId: videoArtistUpdate.videoId,
			});
			await this.validateUnique(videoArtistUpdate);
		}
	}

	private async validateForeignKey({
		artistId,
		videoId,
	}: {
		artistId?: string;
		videoId?: string;
	}) {
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

	private async validateUnique({ videoId, artistId }: VideoArtist) {
		const existed = await this.videoArtistRepo.findOne({
			where: {
				videoId,
				artistId,
			},
		});

		if (existed) {
			throw new ResponseError(VideoArtistMessages.UNIQUE_CONSTRAINT);
		}
	}
}
