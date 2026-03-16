import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
	GetBatchImportLogsDto,
	UploadCompleteDto,
	ValidateReleaseDto,
} from '../dto/batch-import.dto';
import { BatchImportService } from '../services/batch-import.service';

@Controller('batch-import')
export class BatchImportController {
	constructor(private readonly batchImportService: BatchImportService) {}

	@Get('logs')
	async getLogs(@Query() dto: GetBatchImportLogsDto) {
		return await this.batchImportService.getLogs(dto);
	}

	@Post('validate')
	async validateRelease(@Body() dto: ValidateReleaseDto) {
		const result = await this.batchImportService.validateRelease(dto);

		return { data: result };
	}

	@Post('upload-complete')
	async uploadComplete(@Body() dto: UploadCompleteDto) {
		const result = await this.batchImportService.uploadComplete(dto);

		return { data: result };
	}
}
