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
import { ReleaseMessageCodeSuccess } from '../constants/release.constant';

import { Request, Response } from 'express';
import { AuthMessages } from 'src/modules/auth/constants/messages';
import { RequirePermissions } from 'src/modules/auth/decorators/auth.decorator';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import { streamDownload } from 'src/utils/util';
import { QueryGetListReleaseDto, UpdateReleaseDto } from '../dto/release.dto';
import {
	IRelease,
	IReleaseDetail,
	IReleaseNonDraft,
} from '../interfaces/release.interface';
import { ReleaseService } from '../services/release.service';

@ApiTags('Releases')
@Controller('releases')
export class ReleaseController {
	constructor(private readonly releaseService: ReleaseService) {}

	@Get()
	async getListDetail(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<IReleaseDetail>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.releaseService.getListDetail(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async getOneDetail(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<IReleaseDetail>> {
		const result = await this.releaseService.getOneDetail(id);

		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId) && tenantId !== result.tenantId) {
			throw new ResponseError(AuthMessages.FORBIDDEN);
		}

		return new ResponseSuccess({ data: result });
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
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.UPDATE,
		});
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/submit')
	async submit(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<IReleaseNonDraft>> {
		const userId = req.user!.sub;
		const result = await this.releaseService.submit(id, userId);

		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.CREATE,
		});
	}
}
