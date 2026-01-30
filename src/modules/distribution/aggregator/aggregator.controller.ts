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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppResponseSuccess } from 'src/app.const';
import { User, UserId } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UserReq } from 'src/common/interface/common.interface';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { AggregatorSuccess } from './const/aggregator.const';
import {
	CreateAggregatorDto,
	GetListAggregatorDto,
	UpdateAggregatorDto,
} from './dto/aggregator.dto';
import { Aggregator } from './entities/aggregator.entity';
import { AggregatorsService } from './services/aggregators.service';

@ApiTags('Aggregators')
@SystemAdminOnly()
@Controller('distribution/aggregators')
export class AggregatorsController {
	constructor(private readonly svc: AggregatorsService) {}

	@Post()
	@ApiOperation({ summary: 'Create aggregator' })
	@ApiResponse({ status: 201, type: Aggregator })
	async create(
		@Body() data: CreateAggregatorDto,
		@User() user: UserReq,
	): Promise<ResponseSuccess<Aggregator>> {
		const result = await this.svc.create({ data, userId: user.id });
		return AggregatorSuccess.CREATE(result);
	}

	@Post('refill-dsp-usage-count')
	async refillDspUsageCount() {
		await this.svc.refillDspUsageCount();
		return AggregatorSuccess.COMMON();
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
		const result = await this.svc.update({ id, data, userId });
		return AggregatorSuccess.UPDATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get aggregator detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: Aggregator })
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		return AppResponseSuccess.COMMON(await this.svc.findOne(id));
	}

	@Get()
	@ApiOperation({ summary: 'Get aggregators' })
	async getList(@Query() filter: GetListAggregatorDto) {
		return AppResponseSuccess.COMMON(await this.svc.getList(filter));
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete aggregator' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
		@UserId() userId: string,
	): Promise<ResponseSuccess<{ id: string }>> {
		const result = await this.svc.delete({ id, userId });
		return AggregatorSuccess.DELETE(result);
	}
}
