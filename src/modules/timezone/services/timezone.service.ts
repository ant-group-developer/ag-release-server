import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TimezoneMessageError } from '../constants/timezone.constant';
import {
	CreateTimezoneDto,
	QueryGetListTimezoneDto,
	UpdateTimezoneDto,
} from '../dto/timezone.dto';
import { Timezone } from '../entities/timezone.entity';
import { TimezoneQbService } from './timezone.qb.service';

@Injectable()
export class TimezoneService {
	constructor(
		@InjectRepository(Timezone)
		private readonly timezoneRepo: Repository<Timezone>,

		private readonly timezoneQbService: TimezoneQbService,
	) {}

	async create(createTimezoneDto: CreateTimezoneDto): Promise<Timezone> {
		const timezone = this.timezoneRepo.create(createTimezoneDto);
		return await this.timezoneRepo.save(timezone);
	}

	async findOne(id: string): Promise<Timezone> {
		const timezone = await this.timezoneRepo.findOne({ where: { id } });
		if (!timezone) {
			throw new ResponseError({
				message: TimezoneMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return timezone;
	}

	async getList(query: QueryGetListTimezoneDto): Promise<PageDto<Timezone>> {
		const { page, pageSize } = query;

		const queryGetList = this.timezoneQbService.createQueryGetList(query);

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

	async update(
		id: string,
		updateTimezoneDto: UpdateTimezoneDto,
	): Promise<Timezone> {
		await this.findOne(id);

		await this.timezoneRepo.update(id, updateTimezoneDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.timezoneRepo.delete(id);
	}
}
