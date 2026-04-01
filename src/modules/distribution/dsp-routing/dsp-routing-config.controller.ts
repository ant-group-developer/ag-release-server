// src/modules/dsp-routing-configs/dsp-routing-config.controller.ts
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserId } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { DspRoutingConfigSuccess } from './const/dsp-routing-config.const';
import {
	CreateDspRoutingConfigDto,
	GetListDspRoutingConfigsDto,
} from './dto/dsp-routing-config.dto';
import { DspRoutingConfig } from './entities/dsp-routing-config.entity';
import { DspRoutingConfigsService } from './services/dsp-routing-config.service';

@ApiTags('DspRoutingConfigs')
@SystemAdminOnly()
@Controller('distribution/dsp-routing-configs')
export class DspRoutingConfigsController {
	constructor(private readonly svc: DspRoutingConfigsService) {}

	@Post()
	@ApiOperation({ summary: 'Create dsp routing config' })
	@ApiResponse({ status: 201, type: DspRoutingConfig })
	async upsert(
		@Body() data: CreateDspRoutingConfigDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<DspRoutingConfig>> {
		const result = await this.svc.upsert({ data, userId });
		return DspRoutingConfigSuccess.COMMON(result);
	}

	@Get('by-dsp/:dspId')
	async getDetailByDspId(
		@Param('dspId') dspId: string,
		@UserId() userId: string,
	) {
		const result = await this.svc.getDetailByDspIdOrCreate({
			dspId,
			userId,
		});
		return DspRoutingConfigSuccess.COMMON(result);
	}

	@Get('by-dsp-code/:code')
	async getDetailByDspCode(
		@Param('code') code: string,
		@UserId() userId: string,
	) {
		const result = await this.svc.resolveSftpMetadataByDspCode(code);

		return DspRoutingConfigSuccess.COMMON(result);
	}

	@Get('test-resolve-full/:code')
	async testResolveFullDeliveryConfig(@Param('code') code: string) {
		const result = await this.svc.resolveFullDeliveryConfig(code);

		return DspRoutingConfigSuccess.COMMON(result);
	}

	@Get('test-resolve-raw/:code')
	async testResolveRawDeliveryConfig(@Param('code') code: string) {
		const result = await this.svc.resolveRawDeliveryConfig(code);

		return DspRoutingConfigSuccess.COMMON(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get dsp routing config detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: DspRoutingConfig })
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		return DspRoutingConfigSuccess.COMMON(await this.svc.getDetail(id));
	}

	@Get()
	@ApiOperation({ summary: 'Get dsp routing configs' })
	async getList(@Query() filter: GetListDspRoutingConfigsDto) {
		return DspRoutingConfigSuccess.COMMON(await this.svc.getList(filter));
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete dsp routing config' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
		@UserId() userId: string,
	): Promise<ResponseSuccess<{ id: string }>> {
		const result = await this.svc.delete({ id, userId });
		return DspRoutingConfigSuccess.COMMON(result);
	}
}
