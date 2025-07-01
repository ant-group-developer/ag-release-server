import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import {
	ReleaseArtistMessageCodeError,
	ReleaseArtistMessageError,
} from '../constants/release-artist.constant';

@Injectable()
export class ReleaseArtistValidateService {
	constructor(
		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

	async validate({
		artistRoleId,
		artistId,
		releaseId,
	}: {
		artistRoleId?: string;
		artistId?: string;
		releaseId?: string;
	}) {
		if (artistRoleId) {
			const genre = await this.artistRoleRepo.findOne({
				where: { id: artistRoleId },
			});

			if (!genre) {
				throw new ResponseError({
					message: ReleaseArtistMessageError.ARTIST_ROLE_NOT_FOUND,
					messageCode:
						ReleaseArtistMessageCodeError.ARTIST_ROLE_NOT_FOUND,
				});
			}
		}

		if (artistId) {
			const genre = await this.artistRepo.findOne({
				where: { id: artistId },
			});

			if (!genre) {
				throw new ResponseError({
					message: ReleaseArtistMessageError.ARTIST_NOT_FOUND,
					messageCode: ReleaseArtistMessageCodeError.ARTIST_NOT_FOUND,
				});
			}
		}

		if (releaseId) {
			const label = await this.releaseRepo.findOne({
				where: { id: releaseId },
			});

			if (!label) {
				throw new ResponseError({
					message: ReleaseArtistMessageError.RELEASE_NOT_FOUND,
					messageCode:
						ReleaseArtistMessageCodeError.RELEASE_NOT_FOUND,
				});
			}
		}
	}
}
