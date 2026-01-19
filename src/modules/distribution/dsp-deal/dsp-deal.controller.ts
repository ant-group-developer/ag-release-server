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
import { DspDealSuccess } from './const/dsp-deal.const';
import {
	CreateDspDealDto,
	GetListDspDealsDto,
	UpdateDspDealDto,
} from './dto/dsp-deal.dto';
import { DspDealEntity } from './entities/dsp-deal.entity';
import { DspDealsService } from './services/dsp-deal.service';

@ApiTags('DSP Deals')
@SystemAdminOnly()
@Controller('distribution/dsps/:dspId/deals')
export class DspDealsController {
	constructor(private readonly svc: DspDealsService) {}

	@Post()
	@ApiOperation({ summary: 'Create DSP deal mapping' })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiResponse({ status: 201, type: DspDealEntity })
	async create(
		@Param('dspId', ParseIntPipe) dspId: number,
		@Body() data: Omit<CreateDspDealDto, 'dspId'>,
	) {
		const result = await this.svc.create({
			data: { ...data, dspId: String(dspId) },
		});
		return DspDealSuccess.CREATE(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list DSP deals by DSP' })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiQuery({ type: GetListDspDealsDto })
	@ApiResponse({ status: 200, type: [DspDealEntity] })
	async getList(
		@Param('dspId', ParseIntPipe) dspId: number,
		@Query() query: GetListDspDealsDto,
	) {
		// const result = await this.svc.getList({
		// 	...query,
		// 	// dspId: String(dspId),
		// });

		const result = await this.svc.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get DSP deal detail' })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiParam({ name: 'id', type: Number })
	@ApiResponse({ status: 200, type: DspDealEntity })
	async findOne(@Param('id', ParseIntPipe) id: number) {
		const result = await this.svc.findOne(String(id));
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update DSP deal mapping' })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiParam({ name: 'id', type: Number })
	@ApiResponse({ status: 200, type: DspDealEntity })
	async update(
		@Param('id', ParseIntPipe) id: number,
		@Body() data: UpdateDspDealDto,
	) {
		const result = await this.svc.update({ id: String(id), data });
		return DspDealSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete DSP deal mapping' })
	@ApiParam({ name: 'dspId', type: Number })
	@ApiParam({ name: 'id', type: Number })
	@ApiResponse({ status: 200 })
	async delete(@Param('id', ParseIntPipe) id: number) {
		await this.svc.delete(String(id));
		return DspDealSuccess.DELETE();
	}
}
