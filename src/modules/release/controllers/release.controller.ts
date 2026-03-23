import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
	Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

import { Request, Response } from 'express';
import { AuthMessages } from 'src/modules/auth/constants/messages';
import {
	RequirePermissions,
	SystemAdminOnly,
} from 'src/modules/auth/decorators/auth.decorator';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import { streamDownload } from 'src/utils/util';
import { Readable } from 'stream';
import { ReleaseSuccess } from '../constants/release.constant';
import { ReleaseQueryDspDeliveryDto } from '../dto/release-query-dsp-delivey.dto';
import {
	FileExportReleaseCiDto,
	QueryGetListReleaseDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { Release } from '../entities/release.entity';
import { IRelease, IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseService } from '../services/release.service';

@ApiTags('Releases')
@Controller('releases')
export class ReleaseController {
	constructor(private readonly releaseService: ReleaseService) {}

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

	@Get('list-data-export-ci')
	async listDataExportCi(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
	) {
		const result = await this.releaseService.listDataExportCi(query);

		return new ResponseSuccess({ data: result });
	}

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

	@Get(':id/full')
	async findOneFull(@Param('id') id: string, @Req() req: Request) {
		const result = await this.releaseService.findOneFull(id);

		return new ResponseSuccess({ data: result });
	}

	@Get(':id/list-code-export-ci')
	async listCodeExportCiById(@Param('id') id: string, @Req() req: Request) {
		const result = await this.releaseService.listCodeExportCiById(id);

		return new ResponseSuccess({ data: result });
	}

	@Get(':id/record-export-ci')
	async dataExportCiById(@Param('id') id: string, @Req() req: Request) {
		const result = await this.releaseService.dataExportCiById(id);

		return new ResponseSuccess({ data: result });
	}

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

	@Get(':id/download/csv-metadata')
	async downloadCsvMetadata(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getFileCsvMetadata(id);
		streamDownload(res, data);
	}

	@Get(':id/download/xlsx-metadata')
	async downloadXlsxMetadata(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getFileXlsxMetadata(id);
		streamDownload(res, data);
	}

	@Get(':id/download/txt-metadata')
	async downloadTxtMetadata(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getFileTxtMetadata(id);
		streamDownload(res, data);
	}

	@Get(':id/download/assets')
	async downloadAssets(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getAssets(id);
		streamDownload(res, data);
	}

	@Get(':id/download/cover-art')
	async downloadCoverArt(@Param('id') id: string, @Res() res: Response) {
		const data = await this.releaseService.getCoverArtStream(id);
		streamDownload(res, data);
	}

	@Get(':id/dsp/delivery')
	async getReleaseDspDelivery(
		@Param('id') id: string,
		@Query() query: ReleaseQueryDspDeliveryDto,
	): Promise<ResponseSuccess<PageDto<any>>> {
		const data = await this.releaseService.getReleaseDspDelivery(id, query);
		return new ResponseSuccess({ data });
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
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

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/submit')
	async submit(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
		@Body() dto: SubmitReleaseDto,
	) {
		const userId = req.user!.sub;
		await this.releaseService.submit(id, userId, dto);

		return new ResponseSuccess({
			messageCode: 'common.processing',
		});
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/gen-upc')
	async genUpc(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<any>> {
		const userId = req.user!.sub;

		const result = await this.releaseService.genUpc(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/parse-release')
	async parseMetadata(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		const result = await this.releaseService.parseMetadata(id);
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/create-and-upload-metadata-ci')
	createMetadataCiAndUploadToSftp(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		this.releaseService
			.createMetadataCiAndUploadToSftp(id)
			.catch((_e) => {});
		return new ResponseSuccess({ message: 'Đang được xử lý' });
	}

	// @RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/create-metadata-ci-on-server')
	async createMetadataCiOnServer(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		const result = await this.releaseService.createMetadataCiOnServer(id);
		return result;
	}

	@Post(':id/upload-metadata-ci-to-bucket')
	async uploadMetadataCiToBucket(
		@Param('id', ParseUUIDPipe) id: string,
		// @Body('localDir') localDir: string,
	) {
		const result = await this.releaseService.uploadMetadataCiToBucket({
			id,
			// localDir,
		});
		return result;
	}

	@Post(':id/download-metadata-ci-to-bucket')
	async downloadMetadataCiFromBucket(@Param('id', ParseUUIDPipe) id: string) {
		const result =
			await this.releaseService.downloadMetadataCiFromBucket(id);
		return result;
	}

	// @RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/upload-metadata-ci-to-sftp')
	async uploadMetadataCiToSftp(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		const result = await this.releaseService.uploadMetadataCiToSftp(id);
		return result;
	}

	// @RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/create-metadata-ci-and-upload-to-bucket')
	async createMetadataCiAndUploadToBucket(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		const result =
			await this.releaseService.createMetadataCiAndUploadToBucket(id);
		return result;
	}

	// spotify
	@Post(':id/create-metadata-spotify-on-server')
	async createMetadataSpotifyOnServer(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		const result =
			await this.releaseService.createMetadataSpotifyOnServer(id);
		return result;
	}

	@Post(':id/upload-metadata-spotify-to-sftp')
	async uploadMetadataSpotifyToSftp(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		const result =
			await this.releaseService.uploadMetadataSpotifyToSftp(id);
		return result;
	}

	@Post(':id/create-and-upload-metadata-spotify')
	createAndUploadMetadataSpotify(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		this.releaseService.createAndUploadMetadataSpotify(id).catch((_e) => {
			console.log(_e);
		});

		return new ResponseSuccess({ message: 'Đang được xử lý' });
	}
}
