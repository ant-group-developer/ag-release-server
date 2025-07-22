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
	constructor(private readonly dspService: DspService) { }

	@Post()
	@ApiOperation({ summary: 'Create a new DSP' })
	@ApiResponse({ status: 200, description: DspMessageSuccess.CREATE })
	@ApiResponse({
		status: 409,
		description: DspMessageError.DUPLICATE_NAME_DSP,
	})
	async create(
		@Body() createDspDto: CreateDspDto,
	): Promise<ResponseSuccess<Dsp>> {
		const result = await this.dspService.create(createDspDto);
		return new ResponseSuccess({
			data: result,
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
	async update(
		@Param('id') id: string,
		@Body() updateDspDto: UpdateDspDto,
	): Promise<ResponseSuccess<Dsp>> {
		const result = await this.dspService.update(id, updateDspDto);
		return new ResponseSuccess({
			data: result,
			messageCode: DspMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a DSP by ID' })
	@ApiResponse({ status: 200, description: DspMessageSuccess.DELETE })
	@ApiResponse({ status: 404, description: DspMessageError.NOT_FOUND })
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.dspService.delete(id);
		return new ResponseSuccess({
			messageCode: DspMessageCodeSuccess.DELETE,
		});
	}
}
