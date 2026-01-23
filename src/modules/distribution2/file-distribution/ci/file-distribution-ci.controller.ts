// src/modules/access-bomb/file/file-distribution-ci.controller.ts
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { ImportReleaseCiDto, ParseReleaseCiDto } from './dto';
import { FileDistributionCiService } from './file-distribution.ci.service';

@ApiTags('File Distribution CI')
@Controller('file-distribution/ci')
export class FileDistributionCiController {
	constructor(private readonly svc: FileDistributionCiService) {}

	@Post('parse')
	@ApiOperation({
		summary: 'Parse 1 release -> export CI package (audio + cover + excel)',
	})
	async parseOne(@Body() body: ParseReleaseCiDto) {
		const { releaseId, batchId } = body;

		if (!releaseId) {
			throw new BadRequestException('releaseId is required');
		}

		const finalBatchId = batchId?.trim() || randomUUID();

		await this.svc.parseRelease(releaseId, finalBatchId);

		return {
			success: true,
			releaseId,
			batchId: finalBatchId,
			outputRoot: `release_parsed/${finalBatchId}`,
		};
	}

	@Post('import')
	@ApiOperation({
		summary: 'Import 1 release -> parse CI package then upload to SFTP',
	})
	async importOne(@Body() body: ImportReleaseCiDto) {
		const result = await this.svc.importRelease(body);

		return result;
	}
}
