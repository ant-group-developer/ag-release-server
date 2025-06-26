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
import { PageDto, ResponseSuccessDto } from 'src/common/dtos/response.dto';
import { DspService } from './dsp.service';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from './dto/dsp.dto';
import { Dsp } from './entities/dsp.entity';

@Controller('dsp')
export class DspController {
	constructor(private readonly dspService: DspService) {}

	@Post()
	async create(
		@Body() createDspDto: CreateDspDto,
	): Promise<ResponseSuccessDto<Dsp>> {
		const result = await this.dspService.create(createDspDto);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccessDto<Dsp>> {
		const result = await this.dspService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListDspDto,
	): Promise<ResponseSuccessDto<PageDto<Dsp>>> {
		const result = await this.dspService.getList(query);
		return new ResponseSuccessDto({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateDspDto: UpdateDspDto,
	): Promise<Dsp> {
		return await this.dspService.update(id, updateDspDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.dspService.remove(id);
	}
}
