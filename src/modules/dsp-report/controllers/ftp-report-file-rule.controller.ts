import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	QueryFtpReportFileRulesDto,
	UpdateFtpReportFileRuleDto,
	UpsertFtpReportFileRuleDto,
} from '../dto/ftp-report-file-rule.dto';
import { FtpReportFileRuleService } from '../services/ftp-report-file-rule.service';

@ApiTags('ftp-report-file-rules')
@Controller('ftp-report-file-rules')
export class FtpReportFileRuleController {
	constructor(private readonly service: FtpReportFileRuleService) {}

	@Get()
	async list(@Query() query: QueryFtpReportFileRulesDto): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.list(query) });
	}

	@Get(':id')
	async detail(@Param('id') id: string): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.findById(id) });
	}

	@Put()
	async create(@Body() dto: UpsertFtpReportFileRuleDto): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.upsert(dto) });
	}

	@Patch(':id')
	async update(@Param('id') id: string, @Body() dto: UpdateFtpReportFileRuleDto): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.update(id, dto) });
	}

	@Delete(':id')
	async disable(@Param('id') id: string): Promise<ResponseSuccess<{ success: boolean }>> {
		await this.service.disable(id);
		return new ResponseSuccess({ data: { success: true } });
	}
}
