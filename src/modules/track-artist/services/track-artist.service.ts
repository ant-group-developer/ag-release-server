import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { TrackContributor } from 'src/modules/track-contributor/entities/track-contributor.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import { TrackArtistMessages } from '../constants/track-artist.constant';
import {
	CreateTrackArtistDto,
	QueryGetListTrackArtistDto,
	UpdateTrackArtistDto,
} from '../dto/track-artist.dto';
import { TrackArtist } from '../entities/track-artist.entity';
import { TypeSource } from '../enum/track-artist.enum';
import { TrackArtistValidateService } from './track-artist.validate.service';

@Injectable()
export class TrackArtistService {
	private readonly logger = new Logger(TrackArtistService.name);

	constructor(
		@InjectRepository(TrackArtist)
		private readonly trackArtistRepo: Repository<TrackArtist>,

		@InjectRepository(TrackContributor)
		private readonly trackContributorRepo: Repository<TrackContributor>,

		@InjectRepository(ReleaseArtist)
		private readonly releaseArtistRepo: Repository<ReleaseArtist>,

		@InjectRepository(ReleaseContributor)
		private readonly releaseContributorRepo: Repository<ReleaseContributor>,

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
			const trackArtist = releaseArtists.map((releaseArtist) => ({
				artistId: releaseArtist.artistId,
				// artistRoleId: releaseArtist.artistRoleId,
				trackId,
				releaseArtistId: releaseArtist.id,
			}));

			await this.mergeTrackArtists({
				items: trackArtist,
				typeSource: TypeSource.FROM_TRACK,
			});
		}
	}

	async syncTrackContributorsFromReleaseArtist(
		releaseArtist: ReleaseArtist,
		tracksTurnOnCopy: Track[],
	) {
		const {
			artistId,
			// artistRoleId
		} = releaseArtist;

		const trackArtistEntities = tracksTurnOnCopy.map((track) => {
			return this.trackArtistRepo.create({
				trackId: track.id,
				artistId,
				// artistRoleId,
				isFromTrackAction: true,
				releaseArtistId: releaseArtist.id,
			});
		});

		await this.trackArtistRepo.save(trackArtistEntities);
	}

	async addArtistToTracks(
		releaseArtist: ReleaseArtist,
		tracksOfRelease: Track[],
	) {
		const {
			artistId,
			// artistRoleId
		} = releaseArtist;

		const trackArtistEntities = tracksOfRelease.map((track) => ({
			trackId: track.id,
			artistId,
			// artistRoleId,
			releaseArtistId: releaseArtist.id,
		}));

		await this.mergeTrackArtists({
			items: trackArtistEntities,
			typeSource: TypeSource.FROM_RELEASE,
		});
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
			const trackArtistEntities = this.trackArtistRepo.create(
				releaseArtists.map((releaseArtist) => ({
					artistId: releaseArtist.artistId,
					// artistRoleId: releaseArtist.artistRoleId,
					trackId,
					releaseArtistId: releaseArtist.id,
					isFromReleaseAction: true,
				})),
			);

			await this.trackArtistRepo.save(trackArtistEntities);
		}
	}

	async copyContributorFromReleaseSource2({
		releaseId,
		trackId,
	}: {
		releaseId: string;
		trackId: string;
	}) {
		const releaseContributors = await this.releaseContributorRepo.find({
			where: { releaseId, addContributorToTracks: true },
		});

		if (releaseContributors.length > 0) {
			const trackArtistEntities = this.trackContributorRepo.create(
				releaseContributors.map((releaseContributor) => ({
					artistId: releaseContributor.artistId,
					artistRoleId: releaseContributor.artistRoleId,
					trackId,
					releaseArtistId: releaseContributor.id,
					isFromReleaseAction: true,
				})),
			);

			await this.trackContributorRepo.save(trackArtistEntities);
		}
	}

	async findOne(id: string): Promise<TrackArtist> {
		const trackArtist = await this.trackArtistRepo.findOne({
			where: { id },
		});

		if (!trackArtist) {
			throw new ResponseError(TrackArtistMessages.NOT_FOUND);
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
				page,
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

	async updateTrackArtist(releaseArtist: ReleaseArtist) {
		const {
			artistId,
			// artistRoleId
		} = releaseArtist;

		const trackArtistsFromRelease = await this.trackArtistRepo.find({
			where: { releaseArtistId: releaseArtist.id },
		});

		const updatedTrackArtists = trackArtistsFromRelease.map(
			(trackArtist) => {
				return {
					...trackArtist,
					artistId: artistId,
					// artistRoleId: artistRoleId,
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

	async deleteRecordOfTrackSafe({
		trackId,
	}: {
		trackId: string;
	}): Promise<void> {
		await this.deleteRecordOfTrack({ trackId })
			.catch()
			.catch((e) =>
				this.logger.warn(`Skip delete, reason: ${e.message}`),
			);
	}

	async deleteArtistSource1(trackId: string) {
		await this.trackArtistRepo
			.createQueryBuilder()
			.update()
			.set({
				isFromTrackAction: false,
			})
			.where('trackId = :trackId', { trackId })
			.andWhere('isFromTrackAction = true')
			.andWhere('releaseArtistId IS NOT NULL')
			.execute();

		await this.deleteUnusedTrackArtists(trackId);
	}

	private async deleteUnusedTrackArtists(trackId: string) {
		await this.trackArtistRepo.delete({
			trackId,
			isFromReleaseAction: false,
			isFromTrackAction: false,
		});
	}

	async deleteTrackArtists(releaseArtist: ReleaseArtist) {
		const { releaseId, id: releaseArtistId } = releaseArtist;

		const trackArtists = await this.trackArtistRepo
			.createQueryBuilder('trackArtist')
			.leftJoin('trackArtist.track', 'track')
			.where('track.releaseId = :releaseId', { releaseId })
			.andWhere('trackArtist.releaseArtistId = :releaseArtistId', {
				releaseArtistId,
			})
			.andWhere(
				'trackArtist.isFromReleaseAction = :isFromReleaseAction',
				{
					isFromReleaseAction: true,
				},
			)
			.getMany();

		if (trackArtists.length) {
			for (const trackArtist of trackArtists) {
				await this.trackArtistRepo.update(
					{ id: trackArtist.id },
					{ isFromReleaseAction: false },
				);

				await this.deleteUnusedTrackArtists(trackArtist.trackId);
			}
		}
	}

	async deleteByReleaseArtist(releaseArtistId: string) {
		await this.trackArtistRepo.delete({ releaseArtistId });
	}

	// private
	private async mergeTrackArtists({
		items,
		typeSource,
	}: {
		items: {
			artistId: string;
			// artistRoleId: string;
			trackId: string;
			releaseArtistId: string;
		}[];
		typeSource: TypeSource;
	}) {
		for (const item of items) {
			const {
				artistId,
				// artistRoleId,
				trackId,
				releaseArtistId,
			} = item;

			const existing = await this.trackArtistRepo.findOne({
				where: {
					artistId,
					//  artistRoleId,
					trackId,
				},
			});

			if (existing) {
				if (
					!existing.isFromReleaseAction &&
					typeSource === TypeSource.FROM_RELEASE
				) {
					existing.isFromReleaseAction = true;
				}

				if (
					!existing.isFromTrackAction &&
					typeSource === TypeSource.FROM_TRACK
				) {
					existing.isFromTrackAction = true;
				}

				existing.releaseArtistId = releaseArtistId;

				await this.trackArtistRepo.save(existing);
			} else {
				const newEntry = this.trackArtistRepo.create({
					artistId,
					// artistRoleId,
					trackId,
					isFromReleaseAction:
						typeSource === TypeSource.FROM_RELEASE ? true : false,
					isFromTrackAction:
						typeSource === TypeSource.FROM_TRACK ? true : false,
					releaseArtistId: releaseArtistId,
				});

				await this.trackArtistRepo.save(newEntry);
			}
		}
	}
}
