// src/modules/distribution/delivery-config/delivery-config.controller.ts
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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { DeliveryConfigSuccess } from './const/delivery-config.const';
import {
	CreateDeliveryConfigDto,
	GetListDeliveryConfigsDto,
	UpdateDeliveryConfigDto,
} from './dto/delivery-config.dto';
import { DeliveryConfig } from './entities/delivery-config.entity';
import { DeliveryConfigService } from './services/delivery-config.service';

@ApiTags('Delivery Configs')
@SystemAdminOnly()
@Controller('distribution/delivery-configs')
export class DeliveryConfigController {
	constructor(private readonly svc: DeliveryConfigService) {}

	@Post()
	@ApiOperation({ summary: 'Create delivery config' })
	@ApiResponse({ status: 201, type: DeliveryConfig })
	async create(
		@Body() data: CreateDeliveryConfigDto,
	): Promise<ResponseSuccess<DeliveryConfig>> {
		const result = await this.svc.create(data);
		return DeliveryConfigSuccess.CREATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update delivery config' })
	@ApiParam({ name: 'id', schema: { type: 'string' }, example: 'cfg_001' })
	@ApiResponse({ status: 200, type: DeliveryConfig })
	async update(
		@Param('id') id: string,
		@Body() data: UpdateDeliveryConfigDto,
	): Promise<ResponseSuccess<DeliveryConfig>> {
		const result = await this.svc.update(id, data);
		return DeliveryConfigSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete delivery config' })
	@ApiParam({ name: 'id', schema: { type: 'string' }, example: 'cfg_001' })
	async delete(
		@Param('id') id: string,
	): Promise<ResponseSuccess<{ id: string }>> {
		const result = await this.svc.delete(id);
		return DeliveryConfigSuccess.DELETE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get delivery config detail' })
	@ApiParam({ name: 'id', schema: { type: 'string' }, example: 'cfg_001' })
	@ApiResponse({ status: 200, type: DeliveryConfig })
	async detail(
		@Param('id') id: string,
	): Promise<ResponseSuccess<DeliveryConfig>> {
		const result = await this.svc.getDetail(id);
		return DeliveryConfigSuccess.DETAIL(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list delivery configs' })
	async list(
		@Query() filter: GetListDeliveryConfigsDto,
	): Promise<ResponseSuccess<any>> {
		const result = await this.svc.getList(filter);
		return DeliveryConfigSuccess.LIST(result);
	}
}
