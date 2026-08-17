// src/modules/ftp-provider-config/ftp-provider-config.controller.ts
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from 'src/common/decorators/req.decorators';
import { UserReq } from 'src/common/interface/common.interface';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { FtpProviderConfigSuccess } from './const/ftp-provider-config.const';
import {
	CreateFtpProviderConfigDto,
	GetListFtpProviderConfigsDto,
	PartialTestFtpProviderConnectionDto,
	TestFtpProviderConnectionDto,
	UpdateFtpProviderConfigDto,
} from './dto/ftp-provider-config.dto';
import { FtpProviderConfig } from './entities/ftp-provider-config.entity';
import { FtpProviderConfigService } from './services/ftp-provider-config.service';

@ApiTags('FtpProviderConfigs')
@SystemAdminOnly()
@Controller('admin/ftp-provider-configs')
export class FtpProviderConfigController {
	constructor(private readonly svc: FtpProviderConfigService) {}

	@Post()
	@ApiOperation({ summary: 'Create ftp provider config' })
	@ApiResponse({ status: 201, type: FtpProviderConfig })
	async create(
		@Body() data: CreateFtpProviderConfigDto,
		@User() user: UserReq,
	) {
		const result = await this.svc.create(data, user.id);
		return FtpProviderConfigSuccess.CREATE(result);
	}

	@Post('test')
	@ApiOperation({ summary: 'Test ftp connection with a raw, unsaved config' })
	async testConnect(@Body() data: TestFtpProviderConnectionDto) {
		const result = await this.svc.testConnect(data);
		return FtpProviderConfigSuccess.COMMON(result as any);
	}

	@Post(':id/test')
	@ApiOperation({
		summary: 'Test ftp connection using a saved config + field overrides',
	})
	@ApiParam({ name: 'id', format: 'uuid' })
	async testConnectById(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: PartialTestFtpProviderConnectionDto,
	) {
		const result = await this.svc.testConnectById(id, data);
		return FtpProviderConfigSuccess.COMMON(result as any);
	}

	@Get()
	@ApiOperation({ summary: 'Get ftp provider configs' })
	async getList(@Query() filter: GetListFtpProviderConfigsDto) {
		return FtpProviderConfigSuccess.COMMON(
			(await this.svc.findAll(filter)) as any,
		);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get ftp provider config detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: FtpProviderConfig })
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		return FtpProviderConfigSuccess.COMMON(await this.svc.findOne(id));
	}

	@Patch(':id')
	@ApiOperation({
		summary:
			'Update ftp provider config (set isActive:true to switch the live sync source)',
	})
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: FtpProviderConfig })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateFtpProviderConfigDto,
		@User() user: UserReq,
	) {
		const result = await this.svc.update(id, data, user.id);
		return FtpProviderConfigSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete ftp provider config (must not be active)' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.svc.remove(id);
		return FtpProviderConfigSuccess.DELETE(result);
	}
}
