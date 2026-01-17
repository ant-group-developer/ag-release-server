// tenant-integration.controller.ts
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

import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AppResponseSuccess } from 'src/app.const';
import { User } from 'src/common/decorators/req.decorators';
import { UserReq } from 'src/common/interface/common.interface';
import { handleTenantId } from 'src/utils/util';
import { TenantIntegrationSuccess } from './const/tenant-integration.const';
import {
	CreateTenantIntegrationDto,
	GetListTenantIntegrationsDto,
	UpdateTenantIntegrationDto,
} from './dto/tenant-integration.dto';
import { TenantIntegrationService } from './services/tenant-integration.service';

@Controller('tenant-integrations')
export class TenantIntegrationController {
	constructor(private readonly service: TenantIntegrationService) {}

	@Post()
	async create(
		@Body() data: CreateTenantIntegrationDto,
		@User() user: UserReq,
	) {
		const res = await this.service.create({
			data,
			userId: user.id,
		});
		return TenantIntegrationSuccess.CREATE(res);
	}

	@Post('auto-generate')
	async autoGenerate(@User() user: UserReq) {
		const res = await this.service.autoCreateAllTenantIntegrations(user.id);
		return TenantIntegrationSuccess.CREATE(res);
	}

	@Get(':id')
	async findOne(@Param('id') id: string) {
		const data = await this.service.findOne(id);
		return AppResponseSuccess.COMMON(data);
	}

	@Get()
	@ApiOperation({ summary: 'Get list tenant integrations' })
	@ApiQuery({ type: GetListTenantIntegrationsDto })
	async getList(
		@Query() query: GetListTenantIntegrationsDto,
		@User() user: UserReq,
	) {
		query.tenantId = handleTenantId(user.tenantId);
		const data = await this.service.getList(query);
		return AppResponseSuccess.COMMON(data);
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@User() user: UserReq,
		@Body() data: UpdateTenantIntegrationDto,
	) {
		const res = await this.service.update({
			id,
			data,
			userId: user.id,
		});
		return TenantIntegrationSuccess.UPDATE(res);
	}

	@Delete(':id')
	async delete(@Param('id') id: string) {
		await this.service.delete(id);
		return TenantIntegrationSuccess.DELETE();
	}
}
