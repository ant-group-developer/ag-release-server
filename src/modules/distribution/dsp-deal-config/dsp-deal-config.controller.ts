import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
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
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { DspDealConfigSuccess } from './const/dsp-deal-config.const';
import {
	CreateDspDealConfigDto,
	GetListDspDealConfigsDto,
	UpdateDspDealConfigDto,
} from './dto/dsp-deal-config.dto';
import { DspDealConfigEntity } from './entities/dsp-deal-config.entity';
import { DspDealConfigsService } from './services/dsp-deal-config.service';

@ApiTags('DSP Deal Configs')
@SystemAdminOnly()
@Controller('distribution/dsp-deal-configs')
export class DspDealConfigsController {
	constructor(private readonly svc: DspDealConfigsService) {}

	@Post()
	@ApiOperation({ summary: 'Create DSP deal config' })
	@ApiResponse({ status: 201, type: DspDealConfigEntity })
	async create(@Body() data: CreateDspDealConfigDto) {
		const result = await this.svc.create({ data });
		return DspDealConfigSuccess.CREATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update DSP deal config' })
	@ApiParam({ name: 'id', type: Number })
	@ApiResponse({ status: 200, type: DspDealConfigEntity })
	async update(
		@Param('id', ParseIntPipe) id: number,
		@Body() data: UpdateDspDealConfigDto,
	) {
		const result = await this.svc.update({ id: String(id), data });
		return DspDealConfigSuccess.UPDATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get DSP deal config detail' })
	@ApiParam({ name: 'id', type: Number })
	@ApiResponse({ status: 200, type: DspDealConfigEntity })
	async findOne(@Param('id', ParseIntPipe) id: number) {
		const result = await this.svc.findOne(String(id));
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get list DSP deal configs' })
	@ApiQuery({ type: GetListDspDealConfigsDto })
	@ApiResponse({ status: 200, type: [DspDealConfigEntity] })
	async getList(@Query() query: GetListDspDealConfigsDto) {
		const result = await this.svc.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete DSP deal config' })
	@ApiParam({ name: 'id', type: Number })
	@ApiResponse({ status: 200 })
	async delete(@Param('id', ParseIntPipe) id: number) {
		await this.svc.delete(String(id));
		return DspDealConfigSuccess.DELETE();
	}
}
