import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { ReleaseMessageError } from '../constants/release.constant';
import {
	CreateReleaseDto,
	QueryGetListReleaseDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
	) {}

	async create(createReleaseDto: CreateReleaseDto): Promise<Release> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			createReleaseDto;

		await this.releaseValidateService.validate({
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		});

		const release = this.releaseRepo.create(createReleaseDto);
		return await this.releaseRepo.save(release);
	}

	async findOne(id: string): Promise<Release> {
		const release = await this.releaseRepo.findOne({ where: { id } });
		if (!release) {
			throw new ResponseError({
				message: ReleaseMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return release;
	}

	async getList(query: QueryGetListReleaseDto): Promise<PageDto<Release>> {
		const { page, pageSize, skip } = query;

		const [releases, totalItems] = await this.releaseRepo.findAndCount({
			skip,
			take: pageSize,
		});

		return new PageDto({
			items: releases,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateReleaseDto: UpdateReleaseDto,
	): Promise<Release> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			updateReleaseDto;

		const release = await this.findOne(id);

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

		await this.releaseRepo.update(id, updateReleaseDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.releaseRepo.delete(id);
	}
}
