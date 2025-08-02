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
import { IReleaseDetail } from '../interfaces/release.interface';
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
		private readonly releaseArtistService: ReleaseArtistService,
		private readonly releaseTerritoryService: ReleaseTerritoryService,

		private readonly trackDraftService: TrackDraftService,
	) {}

	// create
	async create(data: CreateReleaseDraftDto): Promise<Release> {
		const {
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		} = data;

		await this.releaseValidateService.validate({
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		});

		const release = this.releaseRepo.create(data);
		const releaseDb = await this.releaseRepo.save(release);

		// coverArt
		await this.createSubEntities(releaseDb.id);

		return releaseDb;
	}

	private async createSubEntities(releaseId: string) {
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
	): Promise<IReleaseDetail> {
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

		await this.releaseValidateService.handleValidateDataUpdate({
			release,
			dataUpdate: data,
		});

		// subEntities
		await this.updateSubEntities({
			release,
			releaseLanguage,
			releaseCoverArt,
			releaseTerritory,
		});

		await this.releaseRepo.update(id, restOfData);
		const releaseDb = await this.releaseQueryService.getOneDetail(id);

		const { releaseCoverArts, ...restOfRelease } = releaseDb;

		const coverArtThumbnails =
			this.releaseCoverArtService.getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
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

		await this.releaseLanguageDraftService.handleUpdateReleaseLanguage({
			release,
			releaseLanguage,
		});

		await this.releaseTerritoryService.handleUpdateReleaseTerritory({
			release,
			releaseTerritory,
		});

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

	// other
	async validateSchemaRelease(id: string) {
		return await this.releaseValidateService.validateSchemaRelease(id);
	}

	// other
	async validateSchemaRelease2(id: string) {
		return await this.releaseValidateService.validateSchemaRelease2(id);
	}
}
