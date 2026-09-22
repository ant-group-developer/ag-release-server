import {
	Body,
	Controller,
	Get,
	Header,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Put,
	Query,
	Req,
	Res,
} from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

import { Request, Response } from 'express';
import { UserId } from 'src/common/decorators/req.decorators';
import { AuthMessages } from 'src/modules/auth/constants/messages';
import {
	RequirePermissions,
	SystemAdminOnly,
} from 'src/modules/auth/decorators/auth.decorator';
import { ErnVersion } from 'src/modules/ern/interfaces/ern-input.interface';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import { streamDownload } from 'src/utils/util';
import { Readable } from 'stream';
import { ReleaseSuccess } from '../constants/release.constant';
import {
	AutoSubmitUndistributedMusicReleaseDto,
	BulkSubmitReleaseDto,
	FileExportReleaseCiDto,
	QueryGetListReleaseDto,
	ReloadReleaseFormatIdDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { Release } from '../entities/release.entity';
import { IRelease, IReleaseDetail } from '../interfaces/release.interface';
import { UpdateReleaseReviewDecisionDto } from '../modules/release-reviews/dto/release-review.dto';
import { ReleaseService } from '../services/release.service';

@ApiTags('Releases')
@Controller('releases')
export class ReleaseController {
	constructor(private readonly releaseService: ReleaseService) {}

	@ApiOperation({ summary: 'Get paginated release list' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get()
	async getList(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<IReleaseDetail>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.releaseService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get paginated release list by request body' })
	@ApiBody({ type: QueryGetListReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Post('get-list')
	async getListByBody(
		@Body() query: QueryGetListReleaseDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<IReleaseDetail>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.releaseService.getList2(query, req.user!);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({
		summary: 'Count releases by status using the release list filters',
	})
	@ApiBody({ type: QueryGetListReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Post('status-counts')
	async getStatusCounts(
		@Body() query: QueryGetListReleaseDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Record<string, number>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}
		const result = await this.releaseService.getStatusCounts(
			query,
			req.user!,
		);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get release list data for CI export' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get('list-data-export-ci')
	async listDataExportCi(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
	) {
		const result = await this.releaseService.listDataExportCi(query);

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Download release list CI export file' })
	@ApiResponse({
		status: 200,
		description: 'XLSX file stream',
	})
	@Get('file-export-list-release-ci')
	async getFileExportListReleaseCi(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
		@Res() res: Response,
	) {
		const buffer =
			await this.releaseService.getFileExportListReleaseCi(query);

		const stream = Readable.from(buffer);

		return streamDownload(res, {
			stream,
			contentType:
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			fileName: `ci_export_${Date.now()}.xlsx`,
		});
	}

	@ApiOperation({ summary: 'Get simple release list for system admin' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@SystemAdminOnly()
	@Get('simple')
	async getListSimple(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Release>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.releaseService.getListSimple(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Preview release DSP delivery status changes' })
	@ApiBody({ type: BulkSubmitReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Post('bulk-submit/preview-result')
	async previewBulkSubmitResult(@Body() dto: BulkSubmitReleaseDto) {
		const result = await this.releaseService.previewBulkSubmitResult(dto);

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Bulk submit releases' })
	@ApiBody({ type: BulkSubmitReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@Post('bulk-submit')
	async bulkSubmit(@Req() req: Request, @Body() dto: BulkSubmitReleaseDto) {
		await this.releaseService.bulkSubmit(dto, req.user!.sub);

		return new ResponseSuccess({
			messageCode: 'common.processing',
		});
	}

	@ApiOperation({
		summary:
			'Auto submit audio releases whose DSP delivery is not distributed',
	})
	@ApiBody({ type: AutoSubmitUndistributedMusicReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	// @RequirePermissions(Permission.RELEASE_AUDIO.UPDATE)
	@Post('auto-submit-undistributed-music')
	autoSubmitUndistributedMusic(
		@Body() dto: AutoSubmitUndistributedMusicReleaseDto,
	) {
		// const result =
		// await
		this.releaseService
			.autoSubmitUndistributedMusicReleases(dto)
			.catch((error) => {});

		return new ResponseSuccess({});
	}

	@ApiOperation({
		summary: 'Preview audio releases whose DSP delivery is not distributed',
	})
	@ApiBody({ type: AutoSubmitUndistributedMusicReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	// @RequirePermissions(Permission.RELEASE_AUDIO.UPDATE)
	@Post('auto-submit-undistributed-music/preview')
	async previewAutoSubmitUndistributedMusic(
		@Body() dto: AutoSubmitUndistributedMusicReleaseDto,
	) {
		const result =
			await this.releaseService.previewAutoSubmitUndistributedMusicReleases(
				dto,
			);

		return new ResponseSuccess({ data: result });
	}

	@Post('auto-sync-release-format-id')
	@ApiOperation({
		summary:
			'Auto sync release format ID for releases with null CI format ID',
	})
	@ApiBody({ type: ReloadReleaseFormatIdDto, required: false })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	async autoSyncReleaseFormatId(@Body() dto?: ReloadReleaseFormatIdDto) {
		const result = await this.releaseService.autoSyncReleaseFormatId({
			reloadFromCi: dto?.reloadFromCi,
		});
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get or reload release format ID from CI' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiBody({ type: ReloadReleaseFormatIdDto, required: false })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Patch(':id/release-format-id')
	async getReleaseFormatId(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto?: ReloadReleaseFormatIdDto,
	) {
		const result = await this.releaseService.getReleaseFormatId(id, {
			reloadFromCi: dto?.reloadFromCi,
		});
		return new ResponseSuccess({ data: result });
	}

	// id
	@ApiOperation({ summary: 'Get release detail by ID' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get(':id')
	async getOne(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<IReleaseDetail>> {
		const result = await this.releaseService.getOne(id);

		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId) && tenantId !== result.tenantId) {
			throw new ResponseError(AuthMessages.FORBIDDEN);
		}

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get full release detail by ID' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get(':id/full')
	async findOneFull(@Param('id') id: string, @Req() req: Request) {
		const result = await this.releaseService.findOneFull(id);

		return new ResponseSuccess({ data: result });
	}

	@Get(':id/xml')
	@ApiOperation({
		summary: 'Get DDEX XML for release by DSP code (Default is Spotify)',
	})
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiQuery({
		name: 'code',
		type: 'string',
		description: 'DSP Code (e.g., spotify)',
		required: false,
	})
	@ApiQuery({
		name: 'ernVersion',
		enum: ErnVersion,
		description: 'ERN Version (override config)',
		required: false,
	})
	@Header('Content-Type', 'application/xml')
	async getReleaseXml(
		@Param('id', ParseUUIDPipe) id: string,
		@Query('code') code: string,
		@Query('ernVersion') ernVersion?: ErnVersion2,
	) {
		return this.releaseService.getReleaseXml(
			id,
			code || 'spotify',
			ernVersion,
		);
	}

	@ApiOperation({ summary: 'Get CI export DSP codes for release' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get(':id/list-code-export-ci')
	async listCodeExportCiById(@Param('id') id: string, @Req() req: Request) {
		const result = await this.releaseService.listCodeExportCiById(id);

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get CI export record for release' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get(':id/record-export-ci')
	async dataExportCiById(@Param('id') id: string, @Req() req: Request) {
		const result = await this.releaseService.dataExportCiById(id);

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get QA flags from CI for release' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get(':id/qa-flag-ci')
	async getQaFlagsCi(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseService.getQaFlagsCi(id);

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get DSP statuses from CI for release' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Get(':id/status-dsps-ci')
	async getStatusDspsCi(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseService.getStatusDspsCi(id);

		return new ResponseSuccess({ data: result });
	}

	// @Get(':id/test-status')
	// async testSyncStatus(@Param('id', ParseUUIDPipe) id: string) {
	// 	const result = await this.releaseService.testSyncReleaseStatus(id);
	// 	return new ResponseSuccess({ data: result });
	// }

	@ApiOperation({ summary: 'Download CI export file for release' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({
		status: 200,
		description: 'XLSX file stream',
	})
	@Get(':id/file-export-ci')
	async getFileExportCiById(@Param('id') id: string, @Res() res: Response) {
		const buffer = await this.releaseService.getFileExportCiById(id);

		const stream = Readable.from(buffer);

		return streamDownload(res, {
			stream,
			contentType:
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			fileName: `ci_export_${Date.now()}.xlsx`,
		});
	}

	@ApiOperation({ summary: 'Download release metadata as CSV' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'CSV file stream' })
	@Get(':id/download/csv-metadata')
	async downloadCsvMetadata(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getFileCsvMetadata(id);
		streamDownload(res, {
			...data,
			contentType: String(data.contentType || 'application/octet-stream'),
		});
	}

	@ApiOperation({ summary: 'Download release metadata as XLSX' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'XLSX file stream' })
	@Get(':id/download/xlsx-metadata')
	async downloadXlsxMetadata(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getFileXlsxMetadata(id);
		streamDownload(res, {
			...data,
			contentType: String(data.contentType || 'application/octet-stream'),
		});
	}

	@ApiOperation({ summary: 'Download release metadata as TXT' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'TXT file stream' })
	@Get(':id/download/txt-metadata')
	async downloadTxtMetadata(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getFileTxtMetadata(id);
		streamDownload(res, {
			...data,
			contentType: String(data.contentType || 'application/octet-stream'),
		});
	}

	@ApiOperation({ summary: 'Download release assets archive' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Assets file stream' })
	@Get(':id/download/assets')
	async downloadAssets(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getAssets(id);
		streamDownload(res, {
			...data,
			contentType: String(data.contentType || 'application/octet-stream'),
		});
	}

	@ApiOperation({ summary: 'Download release cover art' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Cover art file stream' })
	@Get(':id/download/cover-art')
	async downloadCoverArt(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getCoverArtStream(id);
		streamDownload(res, {
			...data,
			contentType: String(data.contentType || 'application/octet-stream'),
		});
	}

	@ApiOperation({ summary: 'Update release' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiBody({ type: UpdateReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateReleaseDto: UpdateReleaseDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<IRelease>> {
		const userId = req.user!.sub;
		const result = await this.releaseService.update(
			id,
			updateReleaseDto,
			userId,
		);
		return ReleaseSuccess.UPDATE(result);
	}

	@ApiOperation({ summary: 'Download CI export file by DSP codes' })
	@ApiBody({ type: FileExportReleaseCiDto })
	@ApiResponse({
		status: 200,
		description: 'XLSX file stream',
	})
	@Post('file-export-release-ci')
	async getFileExportListReleaseCiByDspCode(
		@Body() data: FileExportReleaseCiDto,
		@Req() req: Request,
		@Res() res: Response,
	) {
		const buffer =
			await this.releaseService.getFileExportListReleaseCiByDspCode(data);

		const stream = Readable.from(buffer);

		return streamDownload(res, {
			stream,
			contentType:
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			fileName: `ci_export_${Date.now()}.xlsx`,
		});
	}

	// api submit
	@ApiOperation({ summary: 'Submit release to selected DSPs' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiBody({ type: SubmitReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@Post(':id/submit')
	async submit(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
		@Body() dto: SubmitReleaseDto,
	) {
		const result = await this.releaseService.submit3(
			id,
			dto,
			req.user!.sub,
		);

		return new ResponseSuccess({
			data: result,
			messageCode: 'common.processing',
		});
	}

	@ApiOperation({ summary: 'Update release review decision' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiBody({ type: UpdateReleaseReviewDecisionDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@Post(':id/release-review')
	async updateReleaseReview(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: UpdateReleaseReviewDecisionDto,
		@UserId() userId: string,
	) {
		const result = await this.releaseService.updateReleaseReview(
			id,
			body,
			userId,
		);

		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Takedown release from selected DSPs' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiBody({ type: SubmitReleaseDto })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@Post(':id/takedown')
	async takedown(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
		@Body() dto: SubmitReleaseDto,
	) {
		const userId = req.user!.sub;
		await this.releaseService.takedown(id, userId, dto);

		return new ResponseSuccess({
			messageCode: 'common.processing',
		});
	}

	@ApiOperation({ summary: 'Generate UPC for release' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@Post(':id/gen-upc')
	async genUpc(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<any>> {
		const userId = req.user!.sub;

		const result = await this.releaseService.genUpcById(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@ApiOperation({ summary: 'Sync lại release status từ DSP deliveries' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@Post(':id/sync-release-status')
	async syncReleaseStatus(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseService.syncReleaseStatus(id);
		return new ResponseSuccess({ data: result });
	}
}
