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
} from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
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

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const data = await this.currencyService.findOne(id);
		return new ResponseSuccess({ data });
	}

	@Post()
	async create(@Body() dto: CreateCurrencyDto) {
		const data = await this.currencyService.create(dto);
		return new ResponseSuccess({
			data,
			messageCode: CurrencyMessageCodeSuccess.CREATE,
		});
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateCurrencyDto,
	) {
		const data = await this.currencyService.update(id, dto);
		return new ResponseSuccess({
			data,
			messageCode: CurrencyMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.currencyService.delete(id);
		return new ResponseSuccess({
			messageCode: CurrencyMessageCodeSuccess.DELETE,
		});
	}
}
