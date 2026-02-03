import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import { TrackContributorException } from '../constants/track-contributor.exception';
import {
	CreateTrackContributorDto,
	QueryGetListTrackContributorDto,
	UpdateTrackContributorDto,
} from '../dto/track-contributor.dto';
import { TrackContributor } from '../entities/track-contributor.entity';
import { TypeSource } from '../enum/track-contributor.enum';
import { TrackContributorValidateService } from './track-contributor.validate.service';

@Injectable()
export class TrackContributorService {
	private readonly logger = new Logger(TrackContributorService.name);

	constructor(
		@InjectRepository(TrackContributor)
		private readonly trackContributorRepo: Repository<TrackContributor>,

		@InjectRepository(ReleaseContributor)
		private readonly releaseContributorRepo: Repository<ReleaseContributor>,

		private readonly trackContributorValidateService: TrackContributorValidateService,
	) {}

	async create(data: CreateTrackContributorDto): Promise<TrackContributor> {
		const trackContributor = this.trackContributorRepo.create(data);

		await this.trackContributorValidateService.handleValidateCreate(
			trackContributor,
		);

		return this.trackContributorRepo.save(trackContributor);
	}

	async findOne(id: string): Promise<TrackContributor> {
		const contributor = await this.trackContributorRepo.findOne({
			where: { id },
		});

		if (!contributor) {
			throw TrackContributorException.NOT_FOUND();
		}

		return contributor;
	}

	async getList(
		query: QueryGetListTrackContributorDto,
	): Promise<PageDto<TrackContributor>> {
		const { page, pageSize, skip } = query;

		const [items, totalItems] =
			await this.trackContributorRepo.findAndCount({
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
		data: UpdateTrackContributorDto,
	): Promise<TrackContributor> {
		const previous = await this.findOne(id);

		const updated = Object.assign({}, previous, data);

		await this.trackContributorValidateService.handleValidateUpdate({
			trackContributorPrevious: previous,
			trackContributorUpdate: updated,
		});

		await this.trackContributorRepo.save(updated);

		return this.findOne(id);
	}

	async updateTrackContributor(releaseContributor: ReleaseContributor) {
		const { artistId, artistRoleId } = releaseContributor;

		const trackArtistsFromRelease = await this.trackContributorRepo.find({
			where: { releaseContributorId: releaseContributor.id },
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

		await this.trackContributorRepo.save(updatedTrackArtists);
	}

	async delete(id: string): Promise<void> {
		await this.trackContributorRepo.delete(id);
	}

	async deleteByReleaseContributor(releaseContributorId: string) {
		await this.trackContributorRepo.delete({ releaseContributorId });
	}

	async syncTrackContributorsFromReleaseContributor(
		releaseContributor: ReleaseContributor,
		tracksTurnOnCopy: Track[],
	) {
		const {
			artistId,
			artistRoleId,
			id: releaseContributorId,
		} = releaseContributor;

		const trackContributorEntities = tracksTurnOnCopy.map((track) =>
			this.trackContributorRepo.create({
				trackId: track.id,
				artistId,
				artistRoleId,
				isFromTrackAction: true,
				releaseContributorId,
			}),
		);

		await this.trackContributorRepo.save(trackContributorEntities);
	}

	async addContributorToTracks(
		releaseContributor: ReleaseContributor,
		tracksOfRelease: Track[],
	) {
		const { artistId, artistRoleId } = releaseContributor;

		const trackArtistEntities = tracksOfRelease.map((track) => ({
			trackId: track.id,
			artistId,
			artistRoleId,
			releaseContributorId: releaseContributor.id,
		}));

		await this.mergeTrackContributors({
			items: trackArtistEntities,
			typeSource: TypeSource.FROM_RELEASE,
		});
	}

	async deleteTrackContributors(releaseContributor: ReleaseContributor) {
		const { releaseId, id: releaseContributorId } = releaseContributor;

		const trackContributors = await this.trackContributorRepo
			.createQueryBuilder('trackContributor')
			.leftJoin('trackContributor.track', 'track')
			.where('track.releaseId = :releaseId', { releaseId })
			.andWhere(
				'trackContributor.releaseContributorId = :releaseContributorId',
				{ releaseContributorId },
			)
			.andWhere(
				'trackContributor.isFromReleaseAction = :isFromReleaseAction',
				{ isFromReleaseAction: true },
			)
			.getMany();

		if (trackContributors.length) {
			for (const trackContributor of trackContributors) {
				await this.trackContributorRepo.update(
					{ id: trackContributor.id },
					{ isFromReleaseAction: false },
				);

				await this.deleteUnusedTrackContributors(
					trackContributor.trackId,
				);
			}
		}
	}

	private async deleteUnusedTrackContributors(trackId: string) {
		await this.trackContributorRepo.delete({
			trackId,
			isFromReleaseAction: false,
			isFromTrackAction: false,
		});
	}

	private async mergeTrackContributors({
		items,
		typeSource,
	}: {
		items: {
			artistId: string;
			artistRoleId: string;
			trackId: string;
			releaseContributorId: string;
		}[];
		typeSource: TypeSource;
	}) {
		for (const item of items) {
			const { artistId, artistRoleId, trackId, releaseContributorId } =
				item;

			const existing = await this.trackContributorRepo.findOne({
				where: {
					artistId,
					artistRoleId,
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

				existing.releaseContributorId = releaseContributorId;

				await this.trackContributorRepo.save(existing);
			} else {
				await this.trackContributorRepo.save(
					this.trackContributorRepo.create({
						artistId,
						artistRoleId,
						trackId,
						releaseContributorId,
						isFromReleaseAction:
							typeSource === TypeSource.FROM_RELEASE,
						isFromTrackAction: typeSource === TypeSource.FROM_TRACK,
					}),
				);
			}
		}
	}
}
