import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	RequirePermissions,
	SystemAdminOnly,
} from '../auth/decorators/auth.decorator';
import { Permission } from '../permission/constants/permission.data.constant';
import { ArtistMessageCodeSuccess } from './constants/artist.constant';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from './dto/artist.dto';
import { Artist } from './entities/artist.entity';
import { ArtistService } from './services/artist.service';

@ApiTags('Artists')
@Controller('artists')
export class ArtistController {
	constructor(private readonly artistService: ArtistService) {}

	@RequirePermissions(Permission.ARTIST.CREATE)
	@Post()
	async create(
		@Body() createArtistDto: CreateArtistDto,
	): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.handleCreate(createArtistDto);
		return new ResponseSuccess({
			data: result,
			messageCode: ArtistMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.findOneLite(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListArtistDto,
	): Promise<ResponseSuccess<PageDto<Artist>>> {
		const result = await this.artistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@RequirePermissions(Permission.ARTIST.UPDATE)
	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() data: UpdateArtistDto,
	): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.handleUpdate(id, data);
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
