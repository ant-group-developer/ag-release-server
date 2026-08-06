import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CLICKHOUSE_TABLES, ClickHouseService } from '../../clickhouse';
import { FtpSourceCategory } from '../../dsp-report/dto/ftp-parser-config.dto';
import { FtpReportFileDiscoveryService } from '../services/ftp/ftp-report-file-discovery.service';

const DISCOVERY_CATEGORIES = ['all', ...Object.values(FtpSourceCategory)];

class UpdateFtpReportFileDiscoveryConfigDto {
	@IsString()
	cron: string;

	@IsOptional()
	@IsBoolean()
	isEnabled?: boolean = true;

	@ApiPropertyOptional({ default: false, description: 'When true, every scheduled run scans all remote periods. Keep false for incremental scans.' })
	@IsOptional()
	@IsBoolean()
	force?: boolean = false;

	@ApiPropertyOptional({ enum: DISCOVERY_CATEGORIES, isArray: true, description: 'Categories used by the scheduled scan. Use all, empty, or omit for every category.' })
	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsIn(DISCOVERY_CATEGORIES, { each: true })
	categories?: string[];

	@ApiPropertyOptional({ default: 30000, description: 'How often the sample-download worker polls, in ms. Lower values mean more FTP logins; the server answers 530 when logins arrive too fast.' })
	@IsOptional()
	@IsInt()
	@Min(1000)
	sampleWorkerIntervalMs?: number;

	@ApiPropertyOptional({ default: 2, description: 'How many sample files each poll downloads, each one an FTP login.' })
	@IsOptional()
	@IsInt()
	@Min(1)
	sampleWorkerBatchSize?: number;

	@ApiPropertyOptional({ default: 3, description: 'How many times a sample task is attempted before it is left failed.' })
	@IsOptional()
	@IsInt()
	@Min(1)
	sampleWorkerMaxAttempts?: number;

	@ApiPropertyOptional({ default: 60000, description: 'How long a failed sample task waits before being retried, in ms.' })
	@IsOptional()
	@IsInt()
	@Min(1000)
	sampleWorkerRetryBackoffMs?: number;
}

class RunFtpReportFileDiscoveryDto {
	@ApiPropertyOptional({ default: false, description: 'False scans only the newest already-scanned period plus newer periods. True scans all history and refreshes discovered catalog entries.' })
	@IsOptional()
	@IsBoolean()
	force?: boolean = false;

	@ApiPropertyOptional({ enum: DISCOVERY_CATEGORIES, isArray: true, description: 'Only scan these categories. Use all, empty, or omit to scan every category.' })
	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsIn(DISCOVERY_CATEGORIES, { each: true })
	categories?: string[];
}

class ResetFtpReportFileDiscoveryDto {
	@ApiProperty({ example: 'RESET_FTP_DISCOVERY', description: 'Required confirmation for deleting all FTP discovery catalog and rules.' })
	@IsString()
	confirmation: string;

	@ApiPropertyOptional({ default: true, description: 'When true, returns affected counts without deleting data.' })
	@IsOptional()
	@IsBoolean()
	dryRun?: boolean = true;
}

class CanonicalizeFtpReportFileRulesDto {
	@ApiProperty({ example: 'CANONICALIZE_FTP_FILE_RULES', description: 'Required only when applying rule consolidation.' })
	@IsOptional()
	@IsString()
	confirmation?: string;

	@ApiPropertyOptional({ default: true, description: 'When true, reports compatible rule merges and conflicts without writing.' })
	@IsOptional()
	@IsBoolean()
	dryRun?: boolean = true;
}

@ApiTags('ftp-report-file-discovery')
@Controller('ftp-report-file-discovery')
export class FtpReportFileDiscoveryController {
	constructor(private readonly service: FtpReportFileDiscoveryService, private readonly clickHouseService: ClickHouseService) {}

	@Post('run')
	async run(@Body() dto: RunFtpReportFileDiscoveryDto): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.start(dto.force ?? false, dto.categories) });
	}

	@Post('reset')
	async reset(@Body() dto: ResetFtpReportFileDiscoveryDto): Promise<ResponseSuccess<unknown>> {
		if (dto.confirmation !== 'RESET_FTP_DISCOVERY') {
			throw new BadRequestException('confirmation must be RESET_FTP_DISCOVERY');
		}
		return new ResponseSuccess({ data: await this.service.resetFtpDiscoveryData(dto.dryRun ?? true) });
	}

	@Post('canonicalize-rules')
	async canonicalizeRules(@Body() dto: CanonicalizeFtpReportFileRulesDto): Promise<ResponseSuccess<unknown>> {
		const dryRun = dto.dryRun ?? true;
		if (!dryRun && dto.confirmation !== 'CANONICALIZE_FTP_FILE_RULES') {
			throw new BadRequestException('confirmation must be CANONICALIZE_FTP_FILE_RULES when dryRun is false');
		}
		return new ResponseSuccess({ data: await this.service.canonicalizeLegacyRules(dryRun) });
	}

	@Get('runs')
	async runs(): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.clickHouseService.query(`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_FILE_SCAN_RUNS} FINAL ORDER BY started_at DESC LIMIT 100`) });
	}

	@Get('runs/:id')
	async runDetail(@Param('id') id: string): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.getRun(id) });
	}

	@Get('sample-tasks')
	async sampleTasks(@Query('status') status?: string): Promise<ResponseSuccess<unknown>> {
		const where = status ? `WHERE status = {status:String}` : '';
		return new ResponseSuccess({ data: await this.clickHouseService.query(`SELECT * FROM ${CLICKHOUSE_TABLES.FTP_REPORT_SAMPLE_TASKS} FINAL ${where} ORDER BY updated_at DESC LIMIT 200`, status ? { status } : {}) });
	}

	@Get('config')
	async config(): Promise<ResponseSuccess<unknown>> { return new ResponseSuccess({ data: await this.service.getConfig() }); }

	@Put('config')
	async updateConfig(@Body() dto: UpdateFtpReportFileDiscoveryConfigDto): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({ data: await this.service.setConfig(dto.cron, dto.isEnabled ?? true, dto.force ?? false, dto.categories ?? [], {
			intervalMs: dto.sampleWorkerIntervalMs,
			batchSize: dto.sampleWorkerBatchSize,
			maxAttempts: dto.sampleWorkerMaxAttempts,
			retryBackoffMs: dto.sampleWorkerRetryBackoffMs,
		}) });
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
