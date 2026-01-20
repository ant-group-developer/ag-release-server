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
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { DspDealSuccess } from './const/dsp-deal.const';
import {
	CreateDspDealDto,
	GetListDspDealsDto,
	UpdateDspDealDto,
} from './dto/dsp-deal.dto';
import { DspDeal } from './entities/dsp-deal.entity';
import { DspDealsService } from './services/dsp-deal.service';

@ApiTags('DSP Deals')
@SystemAdminOnly()
@Controller('distribution/dsps/:dspId/deals')
export class DspDealsController {
	constructor(private readonly svc: DspDealsService) {}

	@Post()
	@ApiOperation({ summary: 'Create DSP deal mapping' })
	@ApiParam({ name: 'dspId', type: String })
	@ApiResponse({ status: 201, type: DspDeal })
	async create(
		@Param('dspId') dspId: string,
		@Body() data: CreateDspDealDto,
	) {
		const result = await this.svc.create({ data: { ...data, dspId } });
		return DspDealSuccess.CREATE(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list DSP deals by DSP' })
	@ApiParam({ name: 'dspId', type: String })
	@ApiQuery({ type: GetListDspDealsDto })
	@ApiResponse({ status: 200, type: [DspDeal] })
	async getList(
		@Param('dspId') dspId: string,
		@Query() query: GetListDspDealsDto,
	) {
		query.dspId = dspId;
		const result = await this.svc.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get DSP deal detail' })
	@ApiParam({ name: 'dspId', type: String })
	@ApiParam({ name: 'id', type: String })
	@ApiResponse({ status: 200, type: DspDeal })
	async findOne(@Param('id') id: string) {
		const result = await this.svc.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update DSP deal mapping' })
	@ApiParam({ name: 'dspId', type: String })
	@ApiParam({ name: 'id', type: String })
	@ApiResponse({ status: 200, type: DspDeal })
	async update(@Param('id') id: string, @Body() data: UpdateDspDealDto) {
		const result = await this.svc.update({ id, data });
		return DspDealSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete DSP deal mapping' })
	@ApiParam({ name: 'dspId', type: String })
	@ApiParam({ name: 'id', type: String })
	@ApiResponse({ status: 200 })
	async delete(@Param('id') id: string) {
		await this.svc.delete(id);
		return DspDealSuccess.DELETE();
	}
}
