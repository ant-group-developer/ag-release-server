// src/modules/distribution2/sftp/sftp.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { SftpService } from './sftp.service';

@Controller('sftp')
export class SftpController {
	constructor(private readonly sftp: SftpService) {}

	@Get()
	async list(@Query('remotePath') remotePath?: string) {
		// nếu query.path undefined -> list baseDir
		return await this.sftp.list(remotePath);
	}
}
