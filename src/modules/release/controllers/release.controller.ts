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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { ReleaseMessageCodeSuccess } from '../constants/release.constant';

import { Request } from 'express';
import { RequirePermissions } from 'src/modules/auth/decorators/auth.decorator';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import {
	QueryGetListReleaseDto,
	SubmitCreateReleaseDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
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

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/submit')
	async submit(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: SubmitCreateReleaseDto,
	): Promise<ResponseSuccess<IReleaseNonDraft>> {
		const result = await this.releaseService.submit(id, data);

		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async getOneDetail(
		@Param('id') id: string,
	): Promise<ResponseSuccess<IReleaseDetail>> {
		const result = await this.releaseService.getOneDetail(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getListDetail(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<IReleaseDetail>>> {
		const result = await this.releaseService.getListDetail(
			query,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateReleaseDto: UpdateReleaseDto,
	): Promise<ResponseSuccess<IRelease>> {
		const result = await this.releaseService.update(id, updateReleaseDto);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.UPDATE,
		});
	}
}
