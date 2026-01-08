import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import { ReleaseContributorException } from '../constants/release-contributor.exception';
import { ReleaseContributor } from '../entities/release-contributor.entity';

@Injectable()
export class ReleaseContributorValidateService {
	constructor(
		@InjectRepository(ReleaseContributor)
		private readonly repo: Repository<ReleaseContributor>,

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
		if (
			artistRoleId &&
			!(await this.artistRoleRepo.findOne({
				where: { id: artistRoleId },
			}))
		) {
			throw ReleaseContributorException.ARTIST_ROLE_NOT_FOUND();
		}

		if (
			artistId &&
			!(await this.artistRepo.findOne({
				where: { id: artistId },
			}))
		) {
			throw ReleaseContributorException.ARTIST_NOT_FOUND();
		}

		if (
			releaseId &&
			!(await this.releaseRepo.findOne({
				where: { id: releaseId },
			}))
		) {
			throw ReleaseContributorException.RELEASE_NOT_FOUND();
		}
	}

	private async validateUnique({
		artistId,
		artistRoleId,
		releaseId,
	}: ReleaseContributor) {
		const existed = await this.repo.findOne({
			where: {
				artistId,
				artistRoleId,
				releaseId,
			},
		});

		if (existed) {
			throw ReleaseContributorException.UNIQUE_CONSTRAINT();
		}
	}

	async handleValidateCreate({
		releaseContributor,
	}: {
		releaseContributor: ReleaseContributor;
	}) {
		await this.validateForeignKey(releaseContributor);
		await this.validateUnique(releaseContributor);
	}

	async handleValidateUpdate({
		releaseContributorPrevious,
		releaseContributorUpdate,
	}: {
		releaseContributorPrevious: ReleaseContributor;
		releaseContributorUpdate: ReleaseContributor;
	}) {
		const { artistId, artistRoleId, releaseId } = releaseContributorUpdate;

		if (artistId !== releaseContributorPrevious.artistId) {
			await this.validateForeignKey({ artistId });
			await this.validateUnique(releaseContributorUpdate);
		}

		if (artistRoleId !== releaseContributorPrevious.artistRoleId) {
			await this.validateForeignKey({ artistRoleId });
			await this.validateUnique(releaseContributorUpdate);
		}

		if (releaseId !== releaseContributorPrevious.releaseId) {
			await this.validateForeignKey({ releaseId });
			await this.validateUnique(releaseContributorUpdate);
		}
	}
}
