import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
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

		@InjectRepository(ReleaseArtist)
		private readonly releaseArtistRepo: Repository<ReleaseArtist>,

		private readonly trackArtistValidateService: TrackArtistValidateService,
	) {}

	async create(data: CreateTrackArtistDto): Promise<TrackArtist> {
		const trackArtist = this.trackArtistRepo.create(data);
		await this.trackArtistValidateService.handleValidateCreate(trackArtist);
		return await this.trackArtistRepo.save(trackArtist);
	}

	async copyArtistFromReleaseSource1({
		releaseId,
		trackId,
	}: {
		releaseId: string;
		trackId: string;
	}) {
		const releaseArtists = await this.releaseArtistRepo.find({
			where: { releaseId },
		});

		if (releaseArtists.length > 0) {
			const trackArtistData = releaseArtists.map((releaseArtist) => ({
				artistId: releaseArtist.artistId,
				artistRoleId: releaseArtist.artistRoleId,
				trackId,
				releaseArtistId: releaseArtist.id,
				isFromTrackAction: true,
			}));

			const trackArtistEntities =
				this.trackArtistRepo.create(trackArtistData);

			await this.trackArtistRepo.save(trackArtistEntities);
		}
	}

	async addArtistToTracksSource1(
		releaseArtist: ReleaseArtist,
		tracksTurnOnCopy: Track[],
	) {
		const { artistId, artistRoleId } = releaseArtist;

		const trackArtistEntities = tracksTurnOnCopy.map((track) => {
			return this.trackArtistRepo.create({
				trackId: track.id,
				artistId,
				artistRoleId,
				isFromTrackAction: true,
				releaseArtistId: releaseArtist.id,
			});
		});

		await this.trackArtistRepo.save(trackArtistEntities);
	}

	async addArtistToTracks2(
		releaseArtist: ReleaseArtist,
		tracksOfRelease: Track[],
	) {
		const { artistId, artistRoleId } = releaseArtist;

		const trackArtistEntities = tracksOfRelease.map((track) => {
			return this.trackArtistRepo.create({
				trackId: track.id,
				artistId,
				artistRoleId,
				isFromReleaseAction: true,
				releaseArtistId: releaseArtist.id,
			});
		});

		await this.trackArtistRepo.save(trackArtistEntities);
	}

	async copyArtistFromReleaseSource2({
		releaseId,
		trackId,
	}: {
		releaseId: string;
		trackId: string;
	}) {
		const releaseArtists = await this.releaseArtistRepo.find({
			where: { releaseId, addArtistToTracks: true },
		});

		if (releaseArtists.length > 0) {
			const trackArtistData = releaseArtists.map((releaseArtist) => ({
				artistId: releaseArtist.artistId,
				artistRoleId: releaseArtist.artistRoleId,
				trackId,
				releaseArtistId: releaseArtist.id,
				isFromTrackAction: true,
			}));
			const trackArtistEntities =
				this.trackArtistRepo.create(trackArtistData);
			await this.trackArtistRepo.save(trackArtistEntities);
		}
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

	async update(id: string, data: UpdateTrackArtistDto): Promise<TrackArtist> {
		const trackArtistPrevious = await this.findOne(id);

		const trackArtistUpdate = Object.assign({}, trackArtistPrevious, data);

		await this.trackArtistValidateService.handleValidateUpdate({
			trackArtistPrevious,
			trackArtistUpdate,
		});

		await this.trackArtistRepo.save(trackArtistUpdate);
		await this.unlinkTrackArtistsFromReleaseArtist(id);

		return await this.findOne(id);
	}

	async unlinkTrackArtistsFromReleaseArtist(id: string) {
		await this.trackArtistRepo.update(id, {
			isFromReleaseAction: false,
			isFromTrackAction: false,
			releaseArtistId: null,
		});
	}

	async updateByReleaseArtist(releaseArtist: ReleaseArtist) {
		const { artistId, artistRoleId } = releaseArtist;

		const trackArtistsFromRelease = await this.trackArtistRepo.find({
			where: { releaseArtistId: releaseArtist.id },
		});

		const updatedTrackArtists = trackArtistsFromRelease.map(
			(trackArtist) => {
				return {
					...trackArtist,
					artistId: artistId,
					artistRoleId: artistRoleId,
				};
			},
		);

		await this.trackArtistRepo.save(updatedTrackArtists);
	}

	async delete(id: string): Promise<void> {
		await this.trackArtistRepo.delete(id);
	}

	async deleteRecordOfTrack({ trackId }: { trackId: string }): Promise<void> {
		await this.trackArtistRepo.delete({ trackId });
	}

	async deleteArtistSource1(trackId: string) {
		await this.trackArtistRepo.delete({
			trackId,
			isFromTrackAction: true,
		});
	}

	async deleteArtistTracks2(releaseArtist: ReleaseArtist) {
		const { releaseId } = releaseArtist;

		const trackArtists = await this.trackArtistRepo
			.createQueryBuilder('trackArtist')
			.leftJoin('trackArtist.track', 'track')
			.where('track.releaseId = :releaseId', { releaseId })
			.andWhere('trackArtist.releaseArtistId = :releaseArtistId', {
				releaseArtistId: releaseArtist.id,
			})
			.andWhere(
				'trackArtist.isFromReleaseAction = :isFromReleaseAction',
				{
					isFromReleaseAction: true,
				},
			)
			.select('trackArtist.id')
			.getMany();
		const ids = trackArtists.map((ta) => ta.id);
		if (ids.length) {
			await this.trackArtistRepo.delete(ids);
		}
	}

	async deleteByReleaseArtist(releaseArtistId: string) {
		await this.trackArtistRepo.delete({ releaseArtistId });
	}
}
