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
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';

import { User, UserId } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UserReq } from 'src/common/interface/common.interface';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
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
	@ApiResponse({ status: 201, type: Aggregator })
	async create(
		@Body() data: CreateAggregatorDto,
		@User() user: UserReq,
	): Promise<ResponseSuccess<Aggregator>> {
		const result = await this.aggregatorService.create({
			data,
			userId: user.id,
			// tenantId: user.tenantId === 'system-tenant' ? null : user.tenantId,
		});
		return AggregatorSuccess.CREATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update aggregator' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: Aggregator })
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
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: Aggregator })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.aggregatorService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get list aggregators' })
	@ApiQuery({ type: GetListAggregatorsDto })
	@ApiResponse({ status: 200, type: [Aggregator] })
	async getList(@Query() query: GetListAggregatorsDto) {
		const result = await this.aggregatorService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete aggregator' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.aggregatorService.delete(id);
		return AggregatorSuccess.DELETE();
	}
}
