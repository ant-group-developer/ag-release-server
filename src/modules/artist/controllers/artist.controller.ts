import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	RequirePermissions,
	SystemAdminOnly,
} from '../../auth/decorators/auth.decorator';
import { Permission } from '../../permission/constants/permission.data.constant';
import { checkIsNotSystemTenant } from '../../user/utils/user-type.util';
import { ArtistMessageCodeSuccess } from '../constants/artist.constant';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';
import { ArtistService } from '../services/artist.service';

@ApiTags('Artists')
@Controller('artists')
export class ArtistController {
	constructor(private readonly artistService: ArtistService) {}

	@RequirePermissions(Permission.ARTIST.CREATE)
	@Post()
	async create(
		@Body() createArtistDto: CreateArtistDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Artist>> {
		const userId = req.user!.sub;

		const result = await this.artistService.handleCreate(
			createArtistDto,
			userId,
		);

		return new ResponseSuccess({
			data: result,
			messageCode: ArtistMessageCodeSuccess.CREATE,
		});
	}

	@SystemAdminOnly()
	@Post('sync-spotify')
	async syncSpotifyArtistName(): Promise<ResponseSuccess<void>> {
		// Start in background to avoid HTTP timeout
		this.artistService.syncSpotifyArtistName().catch(console.error);
		return new ResponseSuccess({
			message: 'Background sync for Spotify artist names has been started.',
		});
	}

	@Get()
	async getList(
		@Query() query: QueryGetListArtistDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Artist>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.artistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple(
		@Query() query: QueryGetListArtistDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Artist>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.artistService.getListSimple(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.findOneLite(id);
		return new ResponseSuccess({ data: result });
	}

	@RequirePermissions(Permission.ARTIST.UPDATE)
	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() data: UpdateArtistDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<Artist>> {
		const userId = req.user!.sub;

		const result = await this.artistService.handleUpdate(id, data, userId);
		return new ResponseSuccess({
			data: result,
			messageCode: ArtistMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Delete(':id')
	async delete(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.artistService.delete(id);
		return new ResponseSuccess({
			messageCode: ArtistMessageCodeSuccess.DELETE,
		});
	}

	@RequirePermissions(Permission.ARTIST.UPDATE)
	@Delete(':id/artist-profiles/:artistProfileId')
	async deleteArtistProfile(
		@Param('artistProfileId') artistProfileId: string,
	): Promise<ResponseSuccess<void>> {
		await this.artistService.deleteArtistProfile(artistProfileId);
		return new ResponseSuccess({
			messageCode: ArtistMessageCodeSuccess.DELETE,
		});
	}
}
