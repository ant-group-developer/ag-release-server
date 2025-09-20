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

import { TenantTierResponse } from './constants/tenant-tiers.constant';
import {
	CreateTenantTierDto,
	QueryGetListTenantTierDto,
	UpdateTenantTierDto,
} from './dto/tenant-tiers.dto';
import { TenantTierService } from './services/tenant-tier.service';

@Controller('tenant-tiers')
export class TenantTierController {
	constructor(private readonly tenantTierService: TenantTierService) {}

	@SystemAdminOnly()
	@Post()
	async create(@Body() data: CreateTenantTierDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.tenantTierService.create(data, userId);
		return new ResponseSuccess(TenantTierResponse.CREATE_SUCCESS(result));
	}

	@SystemAdminOnly()
	@Get()
	async getList(@Query() query: QueryGetListTenantTierDto) {
		const result = await this.tenantTierService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.tenantTierService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.tenantTierService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateTenantTierDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.tenantTierService.update(id, data, userId);
		return new ResponseSuccess(TenantTierResponse.UPDATE_SUCCESS(result));
	}

	@SystemAdminOnly()
	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.tenantTierService.delete(id);
		return new ResponseSuccess(TenantTierResponse.DELETE_SUCCESS);
	}
}
