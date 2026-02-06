// src/modules/distribution2/sftp/sftp.controller.ts
import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { SftpMetadata } from '../sftp-configs/type/sftp-config.type';
import { SftpConnectService } from './sftp-connect.service';

@ApiTags('SftpConnect')
@SystemAdminOnly()
@Controller('sftp')
export class SftpConnectController {
	constructor(private readonly svc: SftpConnectService) {}

	@Post('upload-folder')
	@ApiOperation({ summary: 'Upload local folder to SFTP (recursive)' })
	async uploadFolder(
		@Body()
		body: {
			sftp: {
				host: string;
				port?: number;
				username: string;
				password?: string;
				privateKey?: string;
			};
			localDir: string;
			remoteDir: string;
		},
	) {
		await this.svc.uploadFolder(body);
		return { status: true };
	}

	@Post('test')
	@ApiOperation({ summary: 'Test SFTP connection (raw config)' })
	async testConnect(@Body() data: SftpMetadata) {
		const result = await this.svc.testConnect(data);
		return result;
	}

	@Post('ls')
	@ApiOperation({ summary: 'List SFTP directory (raw config)' })
	@ApiQuery({
		name: 'path',
		required: false,
		description: 'Remote path to list',
	})
	async list(@Body() cfg: SftpMetadata, @Query('path') remotePath?: string) {
		const path = (remotePath?.trim() || cfg.path?.trim() || '/').trim();
		const items = await this.svc.listDirect(cfg, path);
		return items;
	}
}
