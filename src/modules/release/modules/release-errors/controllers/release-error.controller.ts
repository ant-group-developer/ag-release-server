import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppResponseSuccess } from 'src/app.const';
import {
	BulkCreateReleaseErrorsDto,
	BulkUpdateReleaseErrorsDto,
	GetListReleaseErrorsDto,
} from '../dto/release-error.dto';
import { ReleaseErrorService } from '../services/release-error.service';

@ApiTags('Release Errors')
@Controller('release-errors')
export class ReleaseErrorController {
	constructor(private readonly service: ReleaseErrorService) {}

	@Post('bulk')
	@ApiOperation({ summary: 'Bulk create release errors' })
	async bulkCreate(@Body() body: BulkCreateReleaseErrorsDto) {
		const result = await this.service.bulkCreateErrors(body.items);
		return AppResponseSuccess.COMMON(result);
	}

	@Put('bulk')
	@ApiOperation({ summary: 'Bulk update release errors' })
	async bulkUpdate(@Body() body: BulkUpdateReleaseErrorsDto) {
		const result = await this.service.bulkUpdateErrors(body.items);
		return AppResponseSuccess.COMMON(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list release errors' })
	@ApiQuery({ type: GetListReleaseErrorsDto })
	async getList(@Query() query: GetListReleaseErrorsDto) {
		const result = await this.service.getListErrors(query);
		return AppResponseSuccess.COMMON(result);
	}

	@Get('enriched')
	@ApiOperation({ summary: 'Get list release errors' })
	@ApiQuery({ type: GetListReleaseErrorsDto })
	async getEnrichedErrors(@Query() query: GetListReleaseErrorsDto) {
		const result = await this.service.getEnrichedErrors(query);
		return AppResponseSuccess.COMMON(result);
	}
}
