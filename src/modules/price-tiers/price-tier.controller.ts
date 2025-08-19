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
import {
	PriceTierMessageCodeSuccess,
	PriceTierMessageSuccess,
} from './constants/price-tiers.constant';
import {
	CreatePriceTierDto,
	QueryGetListPriceTier,
	UpdatePriceTierDto,
} from './dto/price-tier.dto';
import { PriceTierService } from './services/price-tier.service';

@Controller('price-tiers')
export class PriceTierController {
	constructor(private readonly priceTierService: PriceTierService) {}

	@Get()
	async getList(@Query() query: QueryGetListPriceTier) {
		const result = await this.priceTierService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const data = await this.priceTierService.findOne(id);
		return new ResponseSuccess({ data });
	}

	@Post()
	async create(@Body() dto: CreatePriceTierDto) {
		const data = await this.priceTierService.create(dto);
		return new ResponseSuccess({
			data,
			message: PriceTierMessageSuccess.CREATE,
			messageCode: PriceTierMessageCodeSuccess.CREATE,
		});
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdatePriceTierDto,
	) {
		const data = await this.priceTierService.update(id, dto);
		return new ResponseSuccess({
			data,
			message: PriceTierMessageSuccess.UPDATE,
			messageCode: PriceTierMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.priceTierService.delete(id);
		return new ResponseSuccess({
			message: PriceTierMessageSuccess.DELETE,
			messageCode: PriceTierMessageCodeSuccess.DELETE,
		});
	}
}
