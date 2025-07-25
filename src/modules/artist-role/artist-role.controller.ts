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
import {
	ArtistRoleMessageCodeSuccess,
	ArtistRoleMessageError,
	ArtistRoleMessageSuccess,
} from './constants/artist-role.constant';
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

	@ApiOperation({ summary: 'Create a new artist role' })
	@ApiResponse({
		status: 200,
		description: ArtistRoleMessageSuccess.CREATE,
	})
	@ApiResponse({
		status: 409,
		description: ArtistRoleMessageError.DUPLICATE_NAME_ARTIST_ROLE,
	})
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

	@ApiOperation({ summary: 'Get an artist role by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved artist role',
	})
	@ApiResponse({
		status: 404,
		description: ArtistRoleMessageError.NOT_FOUND,
	})
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

	@ApiOperation({ summary: 'Update an artist role by ID' })
	@ApiResponse({
		status: 200,
		description: ArtistRoleMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 409,
		description: ArtistRoleMessageError.DUPLICATE_NAME_ARTIST_ROLE,
	})
	@ApiResponse({
		status: 404,
		description: ArtistRoleMessageError.NOT_FOUND,
	})
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

	@ApiOperation({ summary: 'Delete an artist role by ID' })
	@ApiResponse({
		status: 200,
		description: ArtistRoleMessageSuccess.DELETE,
	})
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
