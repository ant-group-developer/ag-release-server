import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
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
	async create(@Body() createDspDto: CreateDspDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.dspService.handleCreate(createDspDto, userId);
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

	@Get('simple')
	async getListSimple(
		@Query() query: QueryGetListDspDto,
	): Promise<ResponseSuccess<Dsp[]>> {
		const result = await this.dspService.getListSimple(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('enable-policy')
	async getListDspEnablePolicy() {
		return new ResponseSuccess({
			data: await this.dspService.getListDspEnablePolicy(),
		});
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
	async handleUpdate(
		@Param('id') id: string,
		@Body() data: UpdateDspDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.dspService.handleUpdate({
			dspId: id,
			data,
			userId,
		});
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
