import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { TimezoneMessages } from '../constants/timezone.constant';
import {
	CreateTimezoneDto,
	QueryGetListTimezoneDto,
	UpdateTimezoneDto,
} from '../dto/timezone.dto';
import { Timezone } from '../entities/timezone.entity';
import { TimezoneQueryService } from './timezone.query.service';

@Injectable()
export class TimezoneService {
	constructor(
		@InjectRepository(Timezone)
		private readonly timezoneRepo: Repository<Timezone>,

		private readonly timezoneQueryService: TimezoneQueryService,
	) {}

	async create(createTimezoneDto: CreateTimezoneDto): Promise<Timezone> {
		const timezone = this.timezoneRepo.create(createTimezoneDto);
		return await this.timezoneRepo.save(timezone);
	}

	async findOne(id: string): Promise<Timezone> {
		const timezone = await this.timezoneRepo.findOne({ where: { id } });
		if (!timezone) {
			throw new ResponseError(TimezoneMessages.NOT_FOUND);
		}

		return timezone;
	}

	async getList(query: QueryGetListTimezoneDto): Promise<PageDto<Timezone>> {
		const { page, pageSize } = query;

		const queryGetList =
			this.timezoneQueryService.createQueryGetList(query);

		const [timezones, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: timezones,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple() {
		return this.timezoneRepo.find({
			select: ['id', 'name', 'zone', 'utc'],
		});
	}

	async update(
		id: string,
		updateTimezoneDto: UpdateTimezoneDto,
	): Promise<Timezone> {
		await this.findOne(id);

		await this.timezoneRepo.update(id, updateTimezoneDto);
		return await this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const timezone =
			await this.timezoneQueryService.findOneWithCountRelation(id);

		if (!timezone) {
			throw new ResponseError(TimezoneMessages.NOT_FOUND);
		}

		if ((timezone.releasesCount ?? 0) > 0) {
			throw new ResponseError(
				TimezoneMessages.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
			);
		}

		await this.timezoneRepo.delete(id);
	}
}
