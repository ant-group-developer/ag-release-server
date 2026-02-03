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
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
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
import {
	PartialTestConnectionDto,
	SftpMetadata,
} from './type/sftp-config.type';

@ApiTags('SftpConfigs')
@SystemAdminOnly()
@Controller('distribution/sftp-configs')
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
		return SftpConfigSuccess.COMMON(result);
	}

	@Post(':id/test')
	@ApiOperation({ summary: 'test SFTP connection' })
	async testConnectById(
		@Param('id') id: string,
		@Body() data: PartialTestConnectionDto,
	) {
		const result = await this.svc.testConnectById({ id, data });

		return SftpConfigSuccess.COMMON(result);
	}

	@Post('test')
	@ApiOperation({ summary: 'test SFTP connection' })
	async testConnect(@Body() data: SftpMetadata) {
		const result = await this.svc.testConnect({
			host: data.host,
			port: data.port,
			username: data.username,
			password: data.password,
		});

		return SftpConfigSuccess.COMMON(result);
	}

	@Get(':id/ls')
	@ApiOperation({ summary: 'List SFTP directory by config id' })
	@ApiQuery({
		name: 'path',
		required: false,
		description: 'Remote path to list',
	})
	async lsById(@Param('id') id: string, @Query('path') remotePath?: string) {
		const result = await this.svc.lsById(id, remotePath);
		return SftpConfigSuccess.COMMON(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get sftp config detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: SftpConfig })
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		return SftpConfigSuccess.COMMON(await this.svc.getDetail(id));
	}

	@Get()
	@ApiOperation({ summary: 'Get sftp configs' })
	async getList(@Query() filter: GetListSftpConfigsDto) {
		return SftpConfigSuccess.COMMON(await this.svc.getList(filter));
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete sftp config' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
		@UserId() userId: string,
	) {
		const result = await this.svc.delete({ id, userId });
		return SftpConfigSuccess.DELETE(result);
	}
}
