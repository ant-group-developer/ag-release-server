import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	NotFoundException,
	Param,
	Patch,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	AssignDspReportDto,
	CreateDspReportDto,
	QueryGetListDspReportDto,
} from '../dto/dsp-report.dto';
import {
	FtpSourceCategory,
	PreviewFtpParserConfigDto,
	SyncParserCatalogDto,
	UpdateFtpParserFieldMappingsDto,
	UpsertFtpParserConfigDto,
} from '../dto/ftp-parser-config.dto';
import {
	DspReportService,
	DspsReportResponse,
} from '../services/dsp-report.service';
import { FtpParserConfigService } from '../services/ftp-parser-config.service';

@ApiTags('dsp-report')
@Controller('dsp-report')
export class DspReportController {
	constructor(
		private readonly dspReportService: DspReportService,
		private readonly ftpParserConfigService: FtpParserConfigService,
	) {}

	@Get('parser-catalog')
	async parserCatalog(): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({
			data: await this.ftpParserConfigService.getCatalog(),
		});
	}

	/** Parser catalog sync also runs automatically at startup; pass force=true to rewrite unchanged source hashes. */
	@Post('parser-catalog/sync')
	async syncParserCatalog(
		@Query() query: SyncParserCatalogDto,
	): Promise<
		ResponseSuccess<{ filesScanned: number; parsersSynced: number }>
	> {
		return new ResponseSuccess({
			data: await this.ftpParserConfigService.syncParserCatalog(
				query.force ?? false,
			),
		});
	}

	@Get('parser-catalog/:parserCode')
	async parserCatalogDetail(
		@Param('parserCode') parserCode: string,
	): Promise<ResponseSuccess<unknown>> {
		const parser =
			await this.ftpParserConfigService.getCatalogByParserCode(
				parserCode,
			);
		if (!parser) {
			throw new NotFoundException(
				`Parser catalog not found: ${parserCode}. Run POST /dsp-report/parser-catalog/sync first.`,
			);
		}
		return new ResponseSuccess({ data: parser });
	}

	/** Legacy folder mappings are seeded automatically at startup; this endpoint is idempotent. */
	@Post('ftp-parser-configs/seed-legacy')
	async seedLegacyFtpParserConfigs(): Promise<
		ResponseSuccess<{ reportsScanned: number; configsCreated: number }>
	> {
		return new ResponseSuccess({
			data: await this.ftpParserConfigService.seedLegacyConfigs(),
		});
	}

	@Get(':id/ftp-parser-configs')
	async getFtpParserConfigs(
		@Param('id') id: string,
	): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({
			data: await this.ftpParserConfigService.findAllDetailsByDspReport(
				id,
			),
		});
	}

	@Get(':id/ftp-parser-configs/:category')
	async getFtpParserConfig(
		@Param('id') id: string,
		@Param('category') category: FtpSourceCategory,
	): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({
			data: await this.ftpParserConfigService.findByDspReportAndCategory(
				id,
				category,
			),
		});
	}

	@Put(':id/ftp-parser-configs/:category')
	async upsertFtpParserConfig(
		@Param('id') id: string,
		@Param('category') category: FtpSourceCategory,
		@Body() dto: UpsertFtpParserConfigDto,
	): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({
			data: await this.ftpParserConfigService.upsert(id, category, dto),
		});
	}

	@Delete(':id/ftp-parser-configs/:category')
	async disableFtpParserConfig(
		@Param('id') id: string,
		@Param('category') category: FtpSourceCategory,
	): Promise<ResponseSuccess<{ success: boolean }>> {
		await this.ftpParserConfigService.disable(id, category);
		return new ResponseSuccess({ data: { success: true } });
	}

	@Patch('parser-catalog/:parserCode/field-mappings')
	async updateParserFieldMappings(
		@Param('parserCode') parserCode: string,
		@Body() dto: UpdateFtpParserFieldMappingsDto,
	): Promise<ResponseSuccess<unknown>> {
		return new ResponseSuccess({
			data: await this.ftpParserConfigService.updateParserFieldMappings(
				parserCode,
				dto.fieldMappings,
			),
		});
	}

	@Post(':id/ftp-parser-configs/:category/preview')
	previewFtpParserConfig(
		@Param('category') category: FtpSourceCategory,
		@Body() dto: PreviewFtpParserConfigDto,
	): ResponseSuccess<unknown> {
		if (!dto.config)
			throw new BadRequestException('config is required for preview');
		return new ResponseSuccess({
			data: this.ftpParserConfigService.preview(
				category,
				dto.config,
				dto.filePaths,
			),
		});
	}

	@Get()
	async findAll(
		@Query() query: QueryGetListDspReportDto,
	): Promise<ResponseSuccess<PageDto<DspsReportResponse>>> {
		const { items, totalItems } =
			await this.dspReportService.findAll(query);
		return new ResponseSuccess({
			data: new PageDto({
				items,
				metadata: {
					page: query.page,
					pageSize: query.pageSize,
					totalItems,
				},
			}),
		});
	}

	@Get(':id')
	async findById(
		@Param('id') id: string,
	): Promise<ResponseSuccess<DspsReportResponse | null>> {
		const result = await this.dspReportService.findById(id);
		return new ResponseSuccess({ data: result });
	}

	@Post()
	async create(
		@Body() dto: CreateDspReportDto,
	): Promise<ResponseSuccess<DspsReportResponse>> {
		const result = await this.dspReportService.create(
			dto.dspName,
			dto.source,
		);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id/assign')
	async assign(
		@Param('id') id: string,
		@Body() dto: AssignDspReportDto,
	): Promise<ResponseSuccess<{ success: boolean; message: string }>> {
		await this.dspReportService.assignToPgDspsSync(id, dto.pgUuid);
		return new ResponseSuccess({
			data: {
				success: true,
				message: `dsps_report ${id} assigned to pg_uuid ${dto.pgUuid}`,
			},
		});
	}

	@Put(':id/unassign')
	async unassign(
		@Param('id') id: string,
	): Promise<ResponseSuccess<{ success: boolean; message: string }>> {
		await this.dspReportService.unassign(id);
		return new ResponseSuccess({
			data: { success: true, message: `dsps_report ${id} unassigned` },
		});
	}

	@Delete(':id')
	async delete(
		@Param('id') id: string,
	): Promise<ResponseSuccess<{ success: boolean; message: string }>> {
		await this.dspReportService.delete(id);
		return new ResponseSuccess({
			data: { success: true, message: `dsps_report ${id} deleted` },
		});
	}
}
