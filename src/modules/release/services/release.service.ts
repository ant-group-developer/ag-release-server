import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateReleaseDto,
	QueryGetListReleaseDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { ReleaseQbService } from './release.qb.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQbService: ReleaseQbService,
	) {}

	async create(data: CreateReleaseDto): Promise<Release> {
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

	async submit(id: string) {
		const release = await this.releaseQbService.findOne(id);

		if (release.status !== ReleaseStatus.DRAFT) {
			throw new ResponseError({ message: 'Error release.status' });
		}

		release.status = ReleaseStatus.PROCESSING;
		await this.releaseRepo.update(id, release);

		return release;
	}

	async findOne(id: string): Promise<Release> {
		return await this.releaseQbService.findOne(id);
	}

	async getList(query: QueryGetListReleaseDto): Promise<PageDto<Release>> {
		const { page, pageSize } = query;

		const queryGetList = this.releaseQbService.createQueryGetList(query);

		const [releases, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: releases,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, data: UpdateReleaseDto): Promise<Release> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

		const release = await this.releaseQbService.findOne(id);

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

	async remove(id: string): Promise<void> {
		await this.releaseRepo.delete(id);
	}
}
