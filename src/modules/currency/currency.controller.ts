import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { CurrencyMessageCodeSuccess } from './constants/currency.constant';
import {
	CreateCurrencyDto,
	QueryGetListCurrencyDto,
	UpdateCurrencyDto,
} from './dto/currency.dto';
import { CurrencyService } from './services/currency.service';

@Controller('currencies')
export class CurrencyController {
	constructor(private readonly currencyService: CurrencyService) {}

	@Get()
	async getList(@Query() query: QueryGetListCurrencyDto) {
		const data = await this.currencyService.getList(query);
		return new ResponseSuccess({ data });
	}

	@Get('simple')
	async getListSimple() {
		const data = await this.currencyService.getListSimple();
		return new ResponseSuccess({ data });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const data = await this.currencyService.findOne(id);
		return new ResponseSuccess({ data });
	}

	@SystemAdminOnly()
	@Post()
	async create(@Body() dto: CreateCurrencyDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const data = await this.currencyService.create(dto, userId);
		return new ResponseSuccess({
			data,
			messageCode: CurrencyMessageCodeSuccess.CREATE,
		});
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateCurrencyDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const data = await this.currencyService.update(id, dto, userId);
		return new ResponseSuccess({
			data,
			messageCode: CurrencyMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.currencyService.delete(id);
		return new ResponseSuccess({
			messageCode: CurrencyMessageCodeSuccess.DELETE,
		});
	}
}
