import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CLICKHOUSE_TABLES, ClickHouseService } from '../../clickhouse';
import { FtpReportFileDiscoveryService } from '../services/ftp/ftp-report-file-discovery.service';

class UpdateFtpReportFileDiscoveryConfigDto {
	@IsString()
	cron: string;

	@IsOptional()
	@IsBoolean()
	isEnabled?: boolean = true;
}

@ApiTags('ftp-report-file-discovery')
@Controller('ftp-report-file-discovery')
export class FtpReportFileDiscoveryController {
	constructor(private readonly service: FtpReportFileDiscoveryService, private readonly clickHouseService: ClickHouseService) {}

	@Post('run')
	async run(): Promise<ResponseSuccess<unknown>> { return new ResponseSuccess({ data: await this.service.start() }); }

	@Get('runs')
	async runs(): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.clickHouseService.query(`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS} FINAL ORDER BY started_at DESC LIMIT 100`) });
	}

	@Get('runs/:id')
	async runDetail(@Param('id') id: string): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.getRun(id) });
	}

	@Get('config')
	async config(): Promise<ResponseSuccess<unknown>> { return new ResponseSuccess({ data: await this.service.getConfig() }); }

	@Put('config')
	async updateConfig(@Body() dto: UpdateFtpReportFileDiscoveryConfigDto): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.setConfig(dto.cron, dto.isEnabled ?? true) });
	}

	@Get('catalog')
	async catalog(
		@Query('source') source = 'ftp',
		@Query('sourceCategory') sourceCategory?: string,
		@Query('dspFolder') dspFolder?: string,
	): Promise<ResponseSuccess<unknown>> {
		const filters = ['source = {source:String}'];
		const params: Record<string, string> = { source };
		if (sourceCategory) { filters.push('source_category = {sourceCategory:String}'); params.sourceCategory = sourceCategory; }
		if (dspFolder) { filters.push('dsp_folder = {dspFolder:String}'); params.dspFolder = dspFolder; }
		return new ResponseSuccess({ data: await this.clickHouseService.query(
			`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_CATALOG} FINAL WHERE ${filters.join(' AND ')} ORDER BY source_category, dsp_folder, file_name_pattern LIMIT 1000`,
			params,
		) });
	}
}
