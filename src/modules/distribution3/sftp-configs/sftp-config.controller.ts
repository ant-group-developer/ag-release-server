// src/modules/sftp-configs/sftp-config.controller.ts
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppResponseSuccess } from 'src/app.const';
import { User, UserId } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UserReq } from 'src/common/interface/common.interface';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { SftpConfigSuccess } from './const/sftp-config.const';
import {
	CreateSftpConfigDto,
	GetListSftpConfigsDto,
} from './dto/sftp-config.dto';
import { SftpConfig } from './entities/sftp-config.entity';
import { SftpConfigsService } from './services/sftp-config.service';

@ApiTags('SftpConfigs')
@SystemAdminOnly()
@Controller('distribution3/sftp-configs')
export class SftpConfigsController {
	constructor(private readonly svc: SftpConfigsService) {}

	@Post()
	@ApiOperation({ summary: 'Create sftp config' })
	@ApiResponse({ status: 201, type: SftpConfig })
	async create(
		@Body() data: CreateSftpConfigDto,
		@User() user: UserReq,
	): Promise<ResponseSuccess<SftpConfig>> {
		const result = await this.svc.upsert({ data, userId: user.id });
		return SftpConfigSuccess.CREATE(result);
	}

	// @Put(':id')
	// @ApiOperation({ summary: 'Update sftp config' })
	// @ApiParam({ name: 'id', format: 'uuid' })
	// @ApiResponse({ status: 200, type: SftpConfig })
	// async update(
	// 	@Param('id', ParseUUIDPipe) id: string,
	// 	@Body() data: UpdateSftpConfigDto,
	// 	@UserId() userId: string,
	// ): Promise<ResponseSuccess<SftpConfig>> {
	// 	const result = await this.svc.update({ id, data, userId });
	// 	return SftpConfigSuccess.UPDATE(result);
	// }

	@Get(':id')
	@ApiOperation({ summary: 'Get sftp config detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: SftpConfig })
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		return AppResponseSuccess.COMMON(await this.svc.getDetail(id));
	}

	@Get()
	@ApiOperation({ summary: 'Get sftp configs' })
	async getList(@Query() filter: GetListSftpConfigsDto) {
		return AppResponseSuccess.COMMON(await this.svc.getList(filter));
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete sftp config' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
		@UserId() userId: string,
	): Promise<ResponseSuccess<{ id: string }>> {
		const result = await this.svc.delete({ id, userId });
		return SftpConfigSuccess.DELETE(result);
	}
}
