import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TrackArtistValidateService {
	constructor(
		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {}

	async validate({
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
}
