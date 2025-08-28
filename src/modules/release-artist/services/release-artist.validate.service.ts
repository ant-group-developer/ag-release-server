import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import { ReleaseArtistMessage } from '../constants/release-artist.constant';
import { ReleaseArtist } from '../entities/release-artist.entity';

@Injectable()
export class ReleaseArtistValidateService {
	constructor(
		@InjectRepository(ReleaseArtist)
		private readonly releaseArtistRepo: Repository<ReleaseArtist>,

		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

	private async validateForeignKey({
		artistRoleId,
		artistId,
		releaseId,
	}: {
		artistRoleId?: string;
		artistId?: string;
		releaseId?: string;
	}) {
		if (artistRoleId) {
			const entity = await this.artistRoleRepo.findOne({
				where: { id: artistRoleId },
			});

			if (!entity) {
				throw new ResponseError(
					ReleaseArtistMessage.ARTIST_ROLE_NOT_FOUND,
				);
			}
		}

		if (artistId) {
			const entity = await this.artistRepo.findOne({
				where: { id: artistId },
			});

			if (!entity) {
				throw new ResponseError(ReleaseArtistMessage.ARTIST_NOT_FOUND);
			}
		}

		if (releaseId) {
			const entity = await this.releaseRepo.findOne({
				where: { id: releaseId },
			});

			if (!entity) {
				throw new ResponseError(ReleaseArtistMessage.RELEASE_NOT_FOUND);
			}
		}
	}

	private async validateUnique({
		releaseId,
		artistRoleId,
		artistId,
	}: {
		artistRoleId: string;
		artistId: string;
		releaseId: string;
	}) {
		const releaseArtist = await this.releaseArtistRepo.findOne({
			where: {
				releaseId,
				artistRoleId,
				artistId,
			},
		});

		if (releaseArtist) {
			throw new ResponseError(ReleaseArtistMessage.UNIQUE_CONSTRAINT);
		}
	}

	async handleValidateCreate({
		releaseArtist,
	}: {
		releaseArtist: ReleaseArtist;
	}) {
		await this.validateForeignKey(releaseArtist);
		await this.validateUnique(releaseArtist);
	}

	async handleValidateUpdate({
		releaseArtistPrevious,
		releaseArtistUpdate,
	}: {
		releaseArtistPrevious: ReleaseArtist;
		releaseArtistUpdate: ReleaseArtist;
	}) {
		const { artistId, artistRoleId, releaseId } = releaseArtistUpdate;

		if (artistId !== releaseArtistPrevious.artistId) {
			await this.validateForeignKey({
				artistId,
			});
			await this.validateUnique(releaseArtistUpdate);
		}

		if (artistRoleId !== releaseArtistPrevious.artistRoleId) {
			await this.validateForeignKey({
				artistRoleId,
			});

			await this.validateUnique(releaseArtistUpdate);
		}

		if (releaseId !== releaseArtistPrevious.releaseId) {
			await this.validateForeignKey({
				releaseId,
			});

			await this.validateUnique(releaseArtistUpdate);
		}
	}
}
