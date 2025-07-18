import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { ReleaseArtistService } from 'src/modules/release-artist/services/release-artist.service';
import { CreateReleaseCoverArtDto } from 'src/modules/release-cover-art/dto/release-cover-art.dto';
import { ReleaseCoverArtService } from 'src/modules/release-cover-art/services/release-cover-art.service';
import { UpdateReleaseLanguageDraftDto } from 'src/modules/release-language/dto/release-language.draft.dto';
import { ReleaseLanguageDraftService } from 'src/modules/release-language/services/release-language.draft.service';
import { UpdateReleaseTerritoryDto } from 'src/modules/release-territory/dto/release-territory.dto';
import { ReleaseTerritoryService } from 'src/modules/release-territory/services/release-territory.service';
import { TrackDraftService } from 'src/modules/track/services/track.draft.service';
import { Repository } from 'typeorm';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { IReleaseDraft } from '../interfaces/release.interface';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseDraftService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,
		private readonly releaseCoverArtService: ReleaseCoverArtService,
		private readonly releaseLanguageDraftService: ReleaseLanguageDraftService,
		// private readonly bucketService: BucketService,
		private readonly releaseArtistService: ReleaseArtistService,
		private readonly trackDraftService: TrackDraftService,
		private readonly releaseTerritoryService: ReleaseTerritoryService,
	) {}

	// create
	async create(data: CreateReleaseDraftDto): Promise<IReleaseDraft> {
		const {
			// releaseCoverArt,
			...restOfData
		} = data;

		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			restOfData;

		await this.releaseValidateService.validate({
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		});

		const release = this.releaseRepo.create(restOfData);
		const releaseDb = await this.releaseRepo.save(release);

		// coverArt
		await this.createSubEntities(releaseDb.id);

		return this.releaseValidateService.ensureDraftRelease(releaseDb);
	}

	private async createSubEntities(releaseId: string) {
		// await this.releaseCoverArtService.bulkCreate([
		// 	{ releaseId, type: '75x75' },
		// 	{ releaseId, type: '100x100' },
		// 	{ releaseId, type: '160x160' },
		// 	{ releaseId, type: '300x300' },
		// 	{ releaseId, type: 'original' },
		// ]);

		await this.releaseLanguageDraftService.create({
			releaseId,
		});

		await this.releaseTerritoryService.create({
			releaseId,
		});
	}

	// update
	async update(
		id: string,
		data: UpdateReleaseDraftDto,
	): Promise<IReleaseDraft> {
		const {
			releaseCoverArt,
			releaseLanguage,
			releaseTerritory,
			...restOfData
		} = data;

		const release = await this.releaseQueryService.findOne(id);

		if (release.status !== ReleaseStatus.DRAFT) {
			throw new ResponseError({
				message: 'Error release.status',
			});
		}

		await this.handleValidateDataUpdate({ release, dataUpdate: data });

		// subEntities
		await this.updateSubEntities({
			release,
			releaseLanguage,
			releaseCoverArt,
			releaseTerritory,
		});

		await this.releaseRepo.update(id, restOfData);
		const result = await this.releaseQueryService.getOneDetail(id);

		return this.releaseValidateService.ensureDraftRelease(result);
	}

	private async handleValidateDataUpdate({
		release,
		dataUpdate,
	}: {
		release: Release;
		dataUpdate: UpdateReleaseDraftDto;
	}) {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			dataUpdate;

		if (labelId && labelId !== release.labelId) {
			await this.releaseValidateService.validate({
				labelId,
			});
		}

		if (primaryGenreId && primaryGenreId !== release.primaryGenreId) {
			await this.releaseValidateService.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== release.subGenreId) {
			await this.releaseValidateService.validate({
				subGenreId,
			});
		}

		if (
			releaseTimezoneId &&
			releaseTimezoneId !== release.releaseTimezoneId
		) {
			await this.releaseValidateService.validate({
				releaseTimezoneId,
			});
		}
	}

	private async updateSubEntities({
		release,
		releaseLanguage,
		releaseCoverArt,
		releaseTerritory,
	}: {
		release: Release;
		releaseLanguage?: UpdateReleaseLanguageDraftDto;
		releaseCoverArt?: CreateReleaseCoverArtDto | null;
		releaseTerritory?: UpdateReleaseTerritoryDto;
	}) {
		const releaseId = release.id;

		if (releaseLanguage) {
			if (release.releaseLanguage?.id) {
				await this.releaseLanguageDraftService.update({
					id: release.releaseLanguage.id,
					dataUpdate: { ...releaseLanguage },
				});
			} else {
				await this.releaseLanguageDraftService.create({
					releaseId,
					...releaseLanguage,
				});
			}
		}

		if (releaseTerritory) {
			if (release.releaseTerritory?.id) {
				await this.releaseTerritoryService.update(
					release.releaseTerritory.id,
					releaseTerritory,
				);
			} else {
				await this.releaseTerritoryService.create({
					...releaseTerritory,
					releaseId,
				});
			}
		}

		await this.releaseCoverArtService.handleUpdateReleaseCoverArt({
			releaseId,
			releaseCoverArt,
		});
	}

	// delete
	async mainDelete(id: string): Promise<void> {
		await this.deleteRelatedRecords({ releaseId: id });
		await this.releaseRepo.delete(id);
	}

	private async deleteRelatedRecords({ releaseId }: { releaseId: string }) {
		await this.releaseLanguageDraftService.deleteRecordOfRelease({
			releaseId,
		});
		await this.releaseArtistService.deleteRecordOfRelease({ releaseId });
		await this.releaseCoverArtService.deleteRecordOfRelease({ releaseId });
		await this.trackDraftService.deleteRecordOfRelease({ releaseId });
		await this.releaseTerritoryService.deleteRecordOfRelease({ releaseId });
	}
}
