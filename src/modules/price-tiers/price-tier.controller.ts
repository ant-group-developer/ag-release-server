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
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import {
	PriceTierMessageCodeSuccess,
	PriceTierMessageSuccess,
} from './constants/price-tiers.constant';
import {
	BulkUpdatePriceTierDto,
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

	@SystemAdminOnly()
	@Post()
	async create(@Body() dto: CreatePriceTierDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const data = await this.priceTierService.create(dto, userId);
		return new ResponseSuccess({
			data,
			message: PriceTierMessageSuccess.CREATE,
			messageCode: PriceTierMessageCodeSuccess.CREATE,
		});
	}

	@SystemAdminOnly()
	@Put('bulk')
	async bulkUpdate(
		@Body() dto: BulkUpdatePriceTierDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const data = await this.priceTierService.bulkUpdate(dto, userId);
		return new ResponseSuccess({
			data,
			message: PriceTierMessageSuccess.UPDATE,
			messageCode: PriceTierMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdatePriceTierDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const data = await this.priceTierService.update(id, dto, userId);
		return new ResponseSuccess({
			data,
			message: PriceTierMessageSuccess.UPDATE,
			messageCode: PriceTierMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.priceTierService.delete(id);
		return new ResponseSuccess({
			message: PriceTierMessageSuccess.DELETE,
			messageCode: PriceTierMessageCodeSuccess.DELETE,
		});
	}
}
