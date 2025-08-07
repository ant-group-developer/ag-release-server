import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateTenantDto,
	FindTenantsDto,
	UpdateTenantDto,
} from './dtos/tenant.dto';
import { Tenant } from './tenant.entity';
import { TenantService } from './tenant.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
	constructor(private readonly tenantService: TenantService) {}

	@Get()
	@ApiOperation({ summary: 'Get all tenants' })
	async findAll(
		@Query() query: FindTenantsDto,
	): Promise<ResponseSuccess<PageDto<Tenant>>> {
		const result = await this.tenantService.findAll(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Post()
	async create(
		@Body() payload: CreateTenantDto,
	): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.create(payload);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() payload: UpdateTenantDto,
	): Promise<ResponseSuccess<Tenant>> {
		const result = await this.tenantService.update(id, payload);
		return new ResponseSuccess({ data: result });
	}
}
