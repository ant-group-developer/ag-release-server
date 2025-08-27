import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { TimezoneMessageCodeSuccess } from './constants/timezone.constant';

import {
	CreateTimezoneDto,
	QueryGetListTimezoneDto,
	UpdateTimezoneDto,
} from './dto/timezone.dto';
import { Timezone } from './entities/timezone.entity';
import { TimezoneService } from './services/timezone.service';
@ApiTags('Timezones')
@Controller('timezones')
export class TimezoneController {
	constructor(private readonly timezoneService: TimezoneService) {}

	@Post()
	async create(
		@Body() createTimezoneDto: CreateTimezoneDto,
	): Promise<ResponseSuccess<Timezone>> {
		const result = await this.timezoneService.create(createTimezoneDto);
		return new ResponseSuccess({
			data: result,
			messageCode: TimezoneMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<Timezone>> {
		const result = await this.timezoneService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListTimezoneDto,
	): Promise<ResponseSuccess<PageDto<Timezone>>> {
		const result = await this.timezoneService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateTimezoneDto: UpdateTimezoneDto,
	): Promise<ResponseSuccess<Timezone>> {
		const result = await this.timezoneService.update(id, updateTimezoneDto);
		return new ResponseSuccess({
			data: result,
			messageCode: TimezoneMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.timezoneService.delete(id);
		return new ResponseSuccess({
			messageCode: TimezoneMessageCodeSuccess.DELETE,
		});
	}
}
