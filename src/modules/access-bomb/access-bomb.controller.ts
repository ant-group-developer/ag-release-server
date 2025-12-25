// src/access-bomb/access-bomb.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PublicRoute } from '../auth/decorators/auth.decorator';
import { AccessBombService } from './access-bomb.service';

@Controller('access-bomb')
export class AccessBombController {
	constructor(private readonly service: AccessBombService) {}

	@PublicRoute()
	@Get('metadata-release')
	async getListMetadataReleases() {
		const data = await this.service.getListMetadataReleases();

		return data;
	}

	@Get('releases')
	getReleaseList(@Query('token') token: string) {
		return this.service.getReleaseList(token);
	}

	@Get('download')
	async downloadOne(
		@Query('token') token: string,
		@Query('releaseId') releaseId: number,
	) {
		return this.service.downloadRelease(token, releaseId);
	}

	@Get('bulk-download')
	async bulkDownload(@Query('token') token: string) {
		await this.service.bulkDownload(token);
	}

	@PublicRoute()
	@Post('job/parse-batches')
	runParseBatches(
		@Body('bombFilePath') bombFilePath: string,
		@Body('templatePath') templatePath: string,
		@Body('batchSize') batchSize = 10,
	) {
		return this.service.runParseBatchesFromBombFile(
			bombFilePath,
			templatePath,
			batchSize,
		);
	}
}
