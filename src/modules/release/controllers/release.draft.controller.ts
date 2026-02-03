import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import { Request } from 'express';
import {
	RequirePermissions,
	SystemAdminOnly,
} from 'src/modules/auth/decorators/auth.decorator';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	ReleaseException,
	ReleaseSuccess,
} from '../constants/release.constant';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseDraftService } from '../services/release.draft.service';

@ApiTags('Releases Draft')
@Controller('releases/draft')
export class ReleaseDraftController {
	constructor(private readonly releaseDraftService: ReleaseDraftService) {}

	@RequirePermissions(Permission.RELEASE.CREATE)
	@Post()
	async create(@Body() data: CreateReleaseDraftDto, @Req() req: Request) {
		const tenantId = req.user!.tenantId;

		const userId = req.user!.sub;

		if (checkIsSystemTenant(tenantId)) {
			throw ReleaseException.DECLINE_SYSTEM_TENANT();
		}
		const result = await this.releaseDraftService.create(
			data,
			req.user!.tenantId,
			userId,
		);

		return ReleaseSuccess.CREATE(result);
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateReleaseDraftDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<IReleaseDetail>> {
		const userId = req.user!.sub;
		const result = await this.releaseDraftService.update(id, data, userId);

		return ReleaseSuccess.UPDATE(result);
	}

	@RequirePermissions(Permission.RELEASE.CREATE, Permission.RELEASE.UPDATE)
	@Get(':id/validate')
	async getErrorsSchemaRelease(@Param('id') id: string) {
		const result =
			await this.releaseDraftService.getErrorsSchemaRelease(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Delete(':id')
	@ApiOperation({ summary: 'Delete a release by ID' })
	async delete(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.releaseDraftService.handleDelete(id);
		return ReleaseSuccess.DELETE();
	}
}
