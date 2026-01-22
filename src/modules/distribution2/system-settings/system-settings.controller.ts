// src/modules/distribution/system-settings/system-settings.controller.ts
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { SystemSettingsSuccess } from './const/system-settings.const';
import {
	GetListSystemSettingsDto,
	UpsertSystemSettingDto,
} from './dto/system-settings.dto';
import { SystemSetting } from './entities/system-setting.entity';
import { SystemSettingsService } from './services/system-settings.service';

@ApiTags('System Settings')
@SystemAdminOnly()
@Controller('distribution/system-settings')
export class SystemSettingsController {
	constructor(private readonly svc: SystemSettingsService) {}

	@Post()
	@ApiOperation({ summary: 'Upsert system setting' })
	@ApiResponse({ status: 201, type: SystemSetting })
	async upsert(
		@Body() data: UpsertSystemSettingDto,
	): Promise<ResponseSuccess<SystemSetting>> {
		const result = await this.svc.upsert(data);
		return SystemSettingsSuccess.UPSERT(result);
	}

	@Delete(':key')
	@ApiOperation({ summary: 'Delete system setting' })
	@ApiParam({ name: 'key', example: 'GLOBAL_DEFAULT_AGGREGATOR_ID' })
	async delete(
		@Param('key') key: string,
	): Promise<ResponseSuccess<{ key: string }>> {
		const result = await this.svc.delete(key);
		return SystemSettingsSuccess.DELETE(result);
	}

	@Get(':key')
	@ApiOperation({ summary: 'Get system setting detail' })
	@ApiParam({ name: 'key', example: 'GLOBAL_DEFAULT_AGGREGATOR_ID' })
	@ApiResponse({ status: 200, type: SystemSetting })
	async detail(
		@Param('key') key: string,
	): Promise<ResponseSuccess<SystemSetting>> {
		const result = await this.svc.getDetail(key);
		return SystemSettingsSuccess.DETAIL(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list system settings' })
	async list(
		@Query() filter: GetListSystemSettingsDto,
	): Promise<ResponseSuccess<any>> {
		const result = await this.svc.getList(filter);
		return SystemSettingsSuccess.LIST(result);
	}
}
