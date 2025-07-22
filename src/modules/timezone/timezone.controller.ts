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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	TimezoneMessageCodeSuccess,
	TimezoneMessageError,
	TimezoneMessageSuccess,
} from './constants/timezone.constant';

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
	constructor(private readonly timezoneService: TimezoneService) { }

	@Post()
	@ApiOperation({ summary: 'Create a new timezone' })
	@ApiResponse({
		status: 200,
		description: TimezoneMessageSuccess.CREATE,
	})
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
	@ApiOperation({ summary: 'Get a timezone by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved timezone',
	})
	@ApiResponse({
		status: 404,
		description: TimezoneMessageError.NOT_FOUND,
	})
	async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ResponseSuccess<Timezone>> {
		const result = await this.timezoneService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of timezones' })
	@ApiResponse({
		status: 200,
		description: 'List of timezones',
	})
	async getList(
		@Query() query: QueryGetListTimezoneDto,
	): Promise<ResponseSuccess<PageDto<Timezone>>> {
		const result = await this.timezoneService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a timezone by ID' })
	@ApiResponse({
		status: 200,
		description: TimezoneMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 404,
		description: TimezoneMessageError.NOT_FOUND,
	})
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
	@ApiOperation({ summary: 'Delete a timezone by ID' })
	@ApiResponse({
		status: 200,
		description: TimezoneMessageSuccess.DELETE,
	})
	async delete(@Param('id', ParseUUIDPipe) id: string): Promise<ResponseSuccess<void>> {
		await this.timezoneService.delete(id);
		return new ResponseSuccess({
			messageCode: TimezoneMessageCodeSuccess.DELETE,
		});
	}
}
