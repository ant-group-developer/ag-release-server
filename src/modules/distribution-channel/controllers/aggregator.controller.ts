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
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';

import { UserId } from 'src/common/decorators/req.decorators';
import { AggregatorSuccess } from '../const/aggregator.constant';
import {
	CreateAggregatorDto,
	GetListAggregatorsDto,
	UpdateAggregatorDto,
} from '../dto/aggregator.dto';
import { Aggregator } from '../entities/aggregator.entity';
import { AggregatorService } from '../services/aggregator.service';

@ApiTags('Aggregators')
@SystemAdminOnly()
@Controller('distribution-channel/aggregators')
export class AggregatorController {
	constructor(private readonly aggregatorService: AggregatorService) {}

	@Post()
	@ApiOperation({ summary: 'Create aggregator' })
	async create(
		@Body() data: CreateAggregatorDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<Aggregator>> {
		const result = await this.aggregatorService.create({ data, userId });

		return AggregatorSuccess.CREATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update aggregator' })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateAggregatorDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<Aggregator>> {
		const result = await this.aggregatorService.update({
			id,
			data,
			userId,
		});

		return AggregatorSuccess.UPDATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get aggregator detail' })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.aggregatorService.findOne(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get()
	@ApiOperation({ summary: 'Get list aggregators' })
	async getList(@Query() query: GetListAggregatorsDto) {
		const result = await this.aggregatorService.getList(query);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete aggregator' })
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.aggregatorService.delete(id);

		return AggregatorSuccess.DELETE();
	}
}
