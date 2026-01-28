// src/modules/dsp-routing-configs/dsp-routing-config.controller.ts
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
import { DspRoutingConfigSuccess } from './const/dsp-routing-config.const';
import {
	CreateDspRoutingConfigDto,
	GetListDspRoutingConfigsDto,
	UpdateDspRoutingConfigDto,
} from './dto/dsp-routing-config.dto';
import { DspRoutingConfig } from './entities/dsp-routing-config.entity';
import { DspRoutingConfigsService } from './services/dsp-routing-config.service';

@ApiTags('DspRoutingConfigs')
@SystemAdminOnly()
@Controller('distribution3/dsp-routing-configs')
export class DspRoutingConfigsController {
	constructor(private readonly svc: DspRoutingConfigsService) {}

	@Post()
	@ApiOperation({ summary: 'Create dsp routing config' })
	@ApiResponse({ status: 201, type: DspRoutingConfig })
	async upsert(
		@Body() data: CreateDspRoutingConfigDto,
		@User() user: UserReq,
	): Promise<ResponseSuccess<DspRoutingConfig>> {
		const result = await this.svc.upsert({ data, userId: user.id });
		return DspRoutingConfigSuccess.COMMON(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update dsp routing config' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: DspRoutingConfig })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateDspRoutingConfigDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<DspRoutingConfig>> {
		const result = await this.svc.update({ id, data, userId });
		return DspRoutingConfigSuccess.UPDATE(result);
	}

	@Get('by-dsp/:dspId')
	async getDetailByDspId(
		@Param('dspId') dspId: string,
		@UserId() userId: string,
	) {
		return AppResponseSuccess.COMMON(
			await this.svc.getDetailByDspIdOrCreate({ dspId, userId }),
		);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get dsp routing config detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: DspRoutingConfig })
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		return AppResponseSuccess.COMMON(await this.svc.getDetail(id));
	}

	@Get()
	@ApiOperation({ summary: 'Get dsp routing configs' })
	async getList(@Query() filter: GetListDspRoutingConfigsDto) {
		return AppResponseSuccess.COMMON(await this.svc.getList(filter));
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete dsp routing config' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
		@UserId() userId: string,
	): Promise<ResponseSuccess<{ id: string }>> {
		const result = await this.svc.delete({ id, userId });
		return DspRoutingConfigSuccess.DELETE(result);
	}
}
