// src/modules/distribution/dsp-routing/dsp-routing.controller.ts
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { DspRoutingSuccess } from './const/dsp-routing.const';
import {
	AutoCreateDspRoutingSettingDto,
	GetListDspRoutingSettingsDto,
	UpdateDspRoutingSettingDto,
	UpsertDspRoutingSettingDto,
} from './dto/dsp-routing.dto';
import { DspRoutingSetting } from './entities/dsp-routing-setting.entity';
import { DspRoutingService } from './services/dsp-routing.service';

@ApiTags('DSP Routing Settings')
@SystemAdminOnly()
@Controller('distribution/dsp-routing-settings')
export class DspRoutingController {
	constructor(private readonly svc: DspRoutingService) {}

	@Post()
	@ApiOperation({
		summary:
			'Create dsp routing setting (choose existing delivery config records)',
	})
	@ApiResponse({ status: 201, type: DspRoutingSetting })
	async upsert(@Body() data: UpsertDspRoutingSettingDto) {
		const result = await this.svc.upsert(data);
		return DspRoutingSuccess.CREATE(result);
	}

	@Post('auto-create')
	@ApiOperation({
		summary:
			'Auto create DSP routing settings by directConfigId or specificAggregatorConfigId',
	})
	async autoCreate(
		@Body()
		body: AutoCreateDspRoutingSettingDto,
	) {
		const data = await this.svc.createAuto(body);
		return new ResponseSuccess({ data });
	}

	@Put(':id')
	@ApiOperation({
		summary:
			'Update dsp routing setting (choose existing delivery config records)',
	})
	@ApiParam({
		name: 'id',
		schema: { type: 'string', format: 'uuid' },
		example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f',
	})
	@ApiResponse({ status: 200, type: DspRoutingSetting })
	async update(
		@Param('id') id: string,
		@Body() data: UpdateDspRoutingSettingDto,
	): Promise<ResponseSuccess<DspRoutingSetting | null>> {
		const result = await this.svc.update({ id, data });
		return DspRoutingSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete dsp routing setting' })
	@ApiParam({
		name: 'id',
		schema: { type: 'string', format: 'uuid' },
		example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f',
	})
	async delete(
		@Param('id') id: string,
	): Promise<ResponseSuccess<{ id: string }>> {
		const result = await this.svc.delete(id);
		return DspRoutingSuccess.DELETE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get dsp routing setting detail' })
	@ApiParam({
		name: 'id',
		schema: { type: 'string', format: 'uuid' },
		example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f',
	})
	@ApiResponse({ status: 200, type: DspRoutingSetting })
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<DspRoutingSetting>> {
		const result = await this.svc.findOne(id);
		return DspRoutingSuccess.DETAIL(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list dsp routing settings' })
	async list(@Query() filter: GetListDspRoutingSettingsDto) {
		const result = await this.svc.getList(filter);
		return DspRoutingSuccess.LIST(result);
	}
}
