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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	DspMessageCodeSuccess,
	DspMessageError,
	DspMessageSuccess,
} from './constants/dsp.constant';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from './dto/dsp.dto';
import { Dsp } from './entities/dsp.entity';
import { DspService } from './services/dsp.service';

@ApiTags('DSPs')
@Controller('dsps')
export class DspController {
	constructor(private readonly dspService: DspService) {}

	@Post()
	@ApiOperation({ summary: 'Create a new DSP' })
	@ApiResponse({ status: 200, description: DspMessageSuccess.CREATE })
	@ApiResponse({
		status: 409,
		description: DspMessageError.DUPLICATE_NAME_DSP,
	})
	async create(@Body() createDspDto: CreateDspDto) {
		const result = await this.dspService.handleCreate(createDspDto);
		return new ResponseSuccess({
			...result,
			messageCode: DspMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a DSP by ID' })
	@ApiResponse({ status: 200, description: 'Successfully retrieved DSP' })
	@ApiResponse({ status: 404, description: DspMessageError.NOT_FOUND })
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Dsp>> {
		const result = await this.dspService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/dsp-actions')
	async getListActionsOfDsp(@Param('id') id: string) {
		const result = await this.dspService.getListActionsOfDsp(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of DSPs' })
	@ApiResponse({ status: 200, description: 'List of DSPs' })
	async getList(
		@Query() query: QueryGetListDspDto,
	): Promise<ResponseSuccess<PageDto<Dsp>>> {
		const result = await this.dspService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a DSP by ID' })
	@ApiResponse({ status: 200, description: DspMessageSuccess.UPDATE })
	@ApiResponse({
		status: 409,
		description: DspMessageError.DUPLICATE_NAME_DSP,
	})
	@ApiResponse({ status: 404, description: DspMessageError.NOT_FOUND })
	async handleUpdate(@Param('id') id: string, @Body() data: UpdateDspDto) {
		const result = await this.dspService.handleUpdate({ dspId: id, data });
		return new ResponseSuccess({
			...result,
			messageCode: DspMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async delete(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.dspService.handleDelete(id);
		return new ResponseSuccess({
			messageCode: DspMessageCodeSuccess.DELETE,
		});
	}

	@Delete(':id/dsp-actions/:dspActionId')
	async deleteDspAction(
		@Param('dspActionId') dspActionId: string,
	): Promise<ResponseSuccess<void>> {
		await this.dspService.deleteDspAction(dspActionId);
		return new ResponseSuccess({
			messageCode: DspMessageCodeSuccess.DELETE,
		});
	}
}
