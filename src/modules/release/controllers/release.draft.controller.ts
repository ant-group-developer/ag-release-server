import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import { Request } from 'express';
import {
	PublicRoute,
	RequirePermissions,
	SystemAdminOnly,
} from 'src/modules/auth/decorators/auth.decorator';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	ReleaseException,
	ReleaseSuccess,
} from '../constants/release.constant';
import { ReleaseRawSftp } from '../dto/release-sftp.dto';
import {
	CreateReleaseDraftDto,
	SyncReleaseToTracksDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { QueryGetListReleaseDto } from '../dto/release.dto';
import { IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseDraftService } from '../services/release.draft.service';

@ApiTags('Releases Draft')
@Controller('releases/draft')
export class ReleaseDraftController {
	constructor(private readonly releaseDraftService: ReleaseDraftService) {}

	@Get('maps')
	async getLookupMaps() {
		const maps = await this.releaseDraftService.buildLookupMaps();

		return {
			albumFormat: Object.fromEntries(maps.albumFormat),
			genre: Object.fromEntries(maps.genre),
			label: Object.fromEntries(maps.label),

			language: Object.fromEntries(maps.language),
			country: Object.fromEntries(maps.country),

			trackType: Object.fromEntries(maps.trackType),
			trackSensitive: Object.fromEntries(maps.trackSensitive),
			trackOriginType: Object.fromEntries(maps.trackOriginType),

			priceTier: Object.fromEntries(maps.priceTier),

			distributionType: Object.fromEntries(maps.distributionType),
		};
	}

	@RequirePermissions(Permission.RELEASE.CREATE)
	@Post()
	@ApiOperation({ summary: 'Create a draft release' })
	@ApiBody({ type: CreateReleaseDraftDto })
	@ApiResponse({
		status: 201,
		description: 'Draft release created successfully',
	})
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

	// @RequirePermissions(Permission.RELEASE.CREATE, Permission.RELEASE.UPDATE)
	// @PublicRoute()
	@Post('validate-list')
	getErrorsSchemaReleasesSftp(@Body('releases') releases: ReleaseRawSftp[]) {
		const result =
			this.releaseDraftService.getErrorsSchemaReleasesFromSftp(releases);

		// return new ResponseSuccess({ data: result });

		return result;
	}

	@Post('map-and-validate')
	async mapAndValidateExistence(@Body() release: ReleaseRawSftp) {
		const maps = await this.releaseDraftService.buildLookupMaps();

		const result = this.releaseDraftService.mapAndValidateExistence(
			release,
			maps,
		);

		return result;
	}

	// @PublicRoute()
	// @Post('validate')
	// getErrorsSchemaRelease(@Body('release') release: any) {
	// 	const result = this.releaseDraftService.getErrorsSchemaRelease(release);

	// 	return new ResponseSuccess({ data: result });
	// }

	@PublicRoute()
	@Post('import/one')
	async importOneRelease(@Body() payload: ReleaseRawSftp) {
		return this.releaseDraftService.importOneRelease(payload);
	}

	// @PublicRoute()
	@Post('import')
	async importReleases(@Body() payload: ReleaseRawSftp[]) {
		return this.releaseDraftService.importReleases(payload);
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Put(':id')
	@ApiOperation({ summary: 'Update a draft release' })
	@ApiParam({ name: 'id', format: 'uuid', description: 'Release ID' })
	@ApiBody({ type: UpdateReleaseDraftDto })
	@ApiResponse({
		status: 200,
		description: 'Draft release updated successfully',
	})
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateReleaseDraftDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<IReleaseDetail>> {
		const userId = req.user!.sub;
		const result = await this.releaseDraftService.update(id, data, userId);

		return ReleaseSuccess.UPDATE(result);
	}

	@Post(':id/sync-to-tracks')
	@ApiOperation({
		summary: 'Sync selected release data to all tracks',
	})
	@ApiParam({
		name: 'id',
		description: 'Release ID',
	})
	async syncReleaseDataToTracks(
		@Param('id') id: string,
		@Body() dto: SyncReleaseToTracksDto,
	) {
		return this.releaseDraftService.syncReleaseDataToTracks(id, dto);
	}

	@RequirePermissions(Permission.RELEASE.UPDATE)
	@Post(':id/auto-fill-cover-arts')
	async autoFillCoverArts(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<any>> {
		const result = await this.releaseDraftService.autoFillCoverArts(id);

		return ReleaseSuccess.UPDATE(result);
	}

	@RequirePermissions(Permission.RELEASE.CREATE, Permission.RELEASE.UPDATE)
	@Get(':id/validate')
	async getErrorsSchemaReleaseById(@Param('id') id: string) {
		const result =
			await this.releaseDraftService.getErrorsSchemaReleaseById(id);
		return new ResponseSuccess({ data: result });
	}

	@Delete()
	@ApiOperation({ summary: 'Bulk delete releases' })
	@ApiResponse({
		status: 200,
		description: 'Bulk delete releases successfully',
	})
	async bulkDelete(
		@Query() query: QueryGetListReleaseDto,
		@Req() req: Request,
	) {
		// const tenantId = req.user!.tenantId;
		// if (checkIsNotSystemTenant(tenantId)) {
		// 	query.tenantIds = [tenantId];
		// }

		const result = await this.releaseDraftService.bulkDeleteRelease(query);

		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Delete(':id')
	@ApiOperation({ summary: 'Delete a release by ID' })
	async delete(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.releaseDraftService.handleDeleteById(id);
		return ReleaseSuccess.DELETE();
	}
}
