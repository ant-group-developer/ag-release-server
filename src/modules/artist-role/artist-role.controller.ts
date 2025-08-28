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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { ArtistRoleMessageCodeSuccess } from './constants/artist-role.constant';
import {
	CreateArtistRoleDto,
	QueryGetListArtistRoleDto,
	UpdateArtistRoleDto,
} from './dto/artist-role.dto';
import { ArtistRole } from './entities/artist-role.entity';
import { ArtistRoleService } from './services/artist-role.service';

@ApiTags('Artist Roles')
@Controller('artist-roles')
export class ArtistRoleController {
	constructor(private readonly artistRoleService: ArtistRoleService) {}

	@Post()
	async create(
		@Body() createArtistRoleDto: CreateArtistRoleDto,
	): Promise<ResponseSuccess<ArtistRole>> {
		const result = await this.artistRoleService.create(createArtistRoleDto);
		return new ResponseSuccess({
			data: result,
			messageCode: ArtistRoleMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<ArtistRole>> {
		const result = await this.artistRoleService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Get a list of artist roles' })
	@ApiResponse({
		status: 200,
		description: 'List of artist roles',
	})
	@Get()
	async getList(
		@Query() query: QueryGetListArtistRoleDto,
	): Promise<ResponseSuccess<PageDto<ArtistRole>>> {
		const result = await this.artistRoleService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateArtistRoleDto: UpdateArtistRoleDto,
	): Promise<ResponseSuccess<ArtistRole>> {
		const result = await this.artistRoleService.update(
			id,
			updateArtistRoleDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: ArtistRoleMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.artistRoleService.delete(id);
		return new ResponseSuccess({
			messageCode: ArtistRoleMessageCodeSuccess.DELETE,
		});
	}
}
