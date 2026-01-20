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

import { DealTypeSuccess } from './const/deal-type.const';
import {
	CreateDealTypeDto,
	GetListDealTypesDto,
	UpdateDealTypeDto,
} from './dto/deal-type.dto';
import { DealType } from './entities/deal-type.entity';
import { DealTypesService } from './services/deal-type.service';

@ApiTags('Deal Types')
@SystemAdminOnly()
@Controller('distribution/deal-types')
export class DealTypesController {
	constructor(private readonly svc: DealTypesService) {}

	@Post()
	@ApiOperation({ summary: 'Create deal type' })
	@ApiResponse({ status: 201, type: DealType })
	async create(
		@Body() data: CreateDealTypeDto,
		@User() user: UserReq,
	): Promise<ResponseSuccess<DealType>> {
		const result = await this.svc.create({
			data,
			userId: user.id,
		});
		return DealTypeSuccess.CREATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update deal type' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: DealType })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateDealTypeDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<DealType>> {
		const result = await this.svc.update({ id, data, userId });
		return DealTypeSuccess.UPDATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get deal type detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: DealType })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.svc.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get list deal types' })
	@ApiQuery({ type: GetListDealTypesDto })
	@ApiResponse({ status: 200, type: [DealType] })
	async getList(@Query() query: GetListDealTypesDto) {
		const result = await this.svc.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete deal type' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.svc.delete(id);
		return DealTypeSuccess.DELETE();
	}
}
