import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateDraftReleaseDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { ReleaseQbService } from './release.qb.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseDraftService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQbService: ReleaseQbService,
	) {}

	async create(data: CreateDraftReleaseDto): Promise<Release> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

		await this.releaseValidateService.validate({
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		});

		const release = this.releaseRepo.create(data);
		return await this.releaseRepo.save(release);
	}

	async update(id: string, data: UpdateReleaseDraftDto): Promise<Release> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

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

		await this.releaseRepo.update(id, data);
		return await this.releaseQbService.findOne(id);
	}
}
