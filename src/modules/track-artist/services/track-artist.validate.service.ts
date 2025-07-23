import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import {
	TrackArtistMessageCodeError,
	TrackArtistMessageError,
} from '../constants/track-artist.constant';
import { TrackArtist } from '../entities/track-artist.entity';

@Injectable()
export class TrackArtistValidateService {
	constructor(
		@InjectRepository(TrackArtist)
		private readonly trackArtistRepo: Repository<TrackArtist>,

		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {}

	async handleValidateCreate(trackArtist: TrackArtist) {
		await this.validateForeignKey(trackArtist);
		await this.validateUnique(trackArtist);
	}

	async handleValidateUpdate({
		trackArtistPrevious,
		trackArtistUpdate,
	}: {
		trackArtistPrevious: TrackArtist;
		trackArtistUpdate: TrackArtist;
	}) {
		const { artistId, artistRoleId, trackId } = trackArtistUpdate;

		if (artistId !== trackArtistPrevious.artistId) {
			await this.validateForeignKey({
				artistId,
			});
		}

		if (artistRoleId !== trackArtistPrevious.artistRoleId) {
			await this.validateForeignKey({
				artistRoleId,
			});
		}

		if (trackId !== trackArtistPrevious.trackId) {
			await this.validateForeignKey({
				trackId,
			});
		}

		await this.validateUnique(trackArtistUpdate);
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
		if (artistRoleId) {
			const artistRole = await this.artistRoleRepo.findOne({
				where: { id: artistRoleId },
			});

			if (!artistRole) {
				throw new ResponseError({
					message: 'Artist role not found',
				});
			}
		}

		if (artistId) {
			const artist = await this.artistRepo.findOne({
				where: { id: artistId },
			});

			if (!artist) {
				throw new ResponseError({
					message: 'Artist not found',
				});
			}
		}

		if (trackId) {
			const track = await this.trackRepo.findOne({
				where: { id: trackId },
			});

			if (!track) {
				throw new ResponseError({
					message: 'Track not found',
				});
			}
		}
	}

	private async validateUnique({
		trackId,
		artistRoleId,
		artistId,
	}: {
		artistRoleId: string;
		artistId: string;
		trackId: string;
	}) {
		const releaseArtist = await this.trackArtistRepo.findOne({
			where: {
				trackId,
				artistRoleId,
				artistId,
			},
		});

		if (releaseArtist) {
			throw new ResponseError({
				message: TrackArtistMessageError.UNIQUE_CONSTRAINT,
				messageCode: TrackArtistMessageCodeError.UNIQUE_CONSTRAINT,
			});
		}
	}
}
