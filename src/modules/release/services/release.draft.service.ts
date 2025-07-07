import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { IReleaseDraft } from '../interfaces/release.interface';
import { ReleaseQbService } from './release.qb.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseDraftService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQbService: ReleaseQbService,
		// private readonly releaseCoverArtService: ReleaseCoverArtService,
	) {}

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
		const result = await this.releaseRepo.save(release);

		// // coverArt
		// await this.releaseCoverArtService.create({
		// 	...releaseCoverArt,
		// 	releaseId: release.id,
		// });

		return this.releaseValidateService.ensureDraftRelease(result);
	}

	async update(
		id: string,
		data: UpdateReleaseDraftDto,
	): Promise<IReleaseDraft> {
		const {
			//  releaseCoverArt,
			...restOfData
		} = data;
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			restOfData;

		const release = await this.releaseQbService.findOne(id);

		if (release.status !== ReleaseStatus.DRAFT) {
			throw new ResponseError({
				message: 'Error release.status',
			});
		}

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

		await this.releaseRepo.update(id, restOfData);
		const result = await this.releaseQbService.findOne(id);

		return this.releaseValidateService.ensureDraftRelease(result);
	}
}
