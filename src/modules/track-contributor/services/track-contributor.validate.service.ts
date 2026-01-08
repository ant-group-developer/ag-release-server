import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import { TrackContributorException } from '../constants/track-contributor.exception';
import { TrackContributor } from '../entities/track-contributor.entity';

@Injectable()
export class TrackContributorValidateService {
	constructor(
		@InjectRepository(TrackContributor)
		private readonly repo: Repository<TrackContributor>,

		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {}

	async handleValidateCreate(e: TrackContributor) {
		await this.validateForeignKey(e);
		await this.validateUnique(e);
	}

	async handleValidateUpdate({
		trackContributorPrevious,
		trackContributorUpdate,
	}: {
		trackContributorPrevious: TrackContributor;
		trackContributorUpdate: TrackContributor;
	}) {
		const { artistId, artistRoleId, trackId } = trackContributorUpdate;

		if (artistId !== trackContributorPrevious.artistId) {
			await this.validateForeignKey({ artistId });
			await this.validateUnique(trackContributorUpdate);
		}

		if (artistRoleId !== trackContributorPrevious.artistRoleId) {
			await this.validateForeignKey({ artistRoleId });
			await this.validateUnique(trackContributorUpdate);
		}

		if (trackId !== trackContributorPrevious.trackId) {
			await this.validateForeignKey({ trackId });
			await this.validateUnique(trackContributorUpdate);
		}
	}

	private async validateForeignKey({
		artistRoleId,
		artistId,
		trackId,
	}: {
		artistRoleId?: string;
		artistId?: string;
		trackId?: string;
	}) {
		if (
			artistRoleId &&
			!(await this.artistRoleRepo.findOne({
				where: { id: artistRoleId },
			}))
		) {
			throw new ResponseError({
				message: 'Artist role not found',
			});
		}

		if (
			artistId &&
			!(await this.artistRepo.findOne({
				where: { id: artistId },
			}))
		) {
			throw new ResponseError({
				message: 'Artist not found',
			});
		}

		if (
			trackId &&
			!(await this.trackRepo.findOne({
				where: { id: trackId },
			}))
		) {
			throw new ResponseError({
				message: 'Track not found',
			});
		}
	}

	private async validateUnique({
		trackId,
		artistRoleId,
		artistId,
	}: TrackContributor) {
		const existed = await this.repo.findOne({
			where: {
				trackId,
				artistRoleId,
				artistId,
			},
		});

		if (existed) {
			throw TrackContributorException.UNIQUE_CONSTRAINT();
		}
	}
}
