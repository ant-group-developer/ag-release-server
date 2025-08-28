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
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { DspMessageCodeSuccess } from './constants/dsp.constant';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from './dto/dsp.dto';
import { Dsp } from './entities/dsp.entity';
import { DspService } from './services/dsp.service';

@ApiTags('DSPs')
@Controller('dsps')
export class DspController {
	constructor(private readonly dspService: DspService) {}

	@SystemAdminOnly()
	@Post()
	async create(@Body() createDspDto: CreateDspDto) {
		const result = await this.dspService.handleCreate(createDspDto);
		return new ResponseSuccess({
			...result,
			messageCode: DspMessageCodeSuccess.CREATE,
		});
	}

	@Get()
	async getList(
		@Query() query: QueryGetListDspDto,
	): Promise<ResponseSuccess<PageDto<Dsp>>> {
		const result = await this.dspService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('with-actions')
	async getListWithActions(
		@Query() query: QueryGetListDspDto,
	): Promise<ResponseSuccess<PageDto<Dsp>>> {
		const result = await this.dspService.getListWithActions(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Dsp>> {
		const result = await this.dspService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/dsp-actions')
	async getListActionsOfDsp(@Param('id') id: string) {
		const result = await this.dspService.getListActionsOfDsp(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	async handleUpdate(@Param('id') id: string, @Body() data: UpdateDspDto) {
		const result = await this.dspService.handleUpdate({ dspId: id, data });
		return new ResponseSuccess({
			...result,
			messageCode: DspMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Delete(':id')
	async delete(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.dspService.handleDelete(id);
		return new ResponseSuccess({
			messageCode: DspMessageCodeSuccess.DELETE,
		});
	}

	@SystemAdminOnly()
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
