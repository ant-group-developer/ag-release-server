import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TrackArtistMessageError } from '../constants/track-artist.constant';
import {
	CreateTrackArtistDto,
	QueryGetListTrackArtistDto,
	UpdateTrackArtistDto,
} from '../dto/track-artist.dto';
import { TrackArtist } from '../entities/track-artist.entity';
import { TrackArtistValidateService } from './track-artist.validate.service';

@Injectable()
export class TrackArtistService {
	constructor(
		@InjectRepository(TrackArtist)
		private readonly trackArtistRepo: Repository<TrackArtist>,

		private readonly trackArtistValidateService: TrackArtistValidateService,
	) {}

	async create(
		createTrackArtistDto: CreateTrackArtistDto,
	): Promise<TrackArtist> {
		const { artistId, artistRoleId, trackId } = createTrackArtistDto;

		await this.trackArtistValidateService.validate({
			artistId,
			artistRoleId,
			trackId,
		});

		const trackArtist = this.trackArtistRepo.create(createTrackArtistDto);
		return await this.trackArtistRepo.save(trackArtist);
	}

	async findOne(id: string): Promise<TrackArtist> {
		const trackArtist = await this.trackArtistRepo.findOne({
			where: { id },
		});

		if (!trackArtist) {
			throw new ResponseError({
				message: TrackArtistMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return trackArtist;
	}

	async getList(
		query: QueryGetListTrackArtistDto,
	): Promise<PageDto<TrackArtist>> {
		const { page, pageSize, skip } = query;

		const [trackArtists, totalItems] =
			await this.trackArtistRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: trackArtists,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateTrackArtistDto: UpdateTrackArtistDto,
	): Promise<TrackArtist> {
		const { artistId, artistRoleId, trackId } = updateTrackArtistDto;

		const trackArtist = await this.findOne(id);

		if (artistId && artistId !== trackArtist.artistId) {
			await this.trackArtistValidateService.validate({
				artistId,
			});
		}

		if (artistRoleId && artistRoleId !== trackArtist.artistRoleId) {
			await this.trackArtistValidateService.validate({
				artistRoleId,
			});
		}

		if (trackId && trackId !== trackArtist.trackId) {
			await this.trackArtistValidateService.validate({
				trackId,
			});
		}

		await this.trackArtistRepo.update(id, updateTrackArtistDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.trackArtistRepo.delete(id);
	}
}
