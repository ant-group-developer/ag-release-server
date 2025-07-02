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

	@Post()
	@ApiOperation({ summary: 'Create a new artist role' })
	@ApiResponse({
		status: 200,
		description: ArtistRoleMessageSuccess.CREATE,
	})
	@ApiResponse({
		status: 409,
		description: ArtistRoleMessageError.DUPLICATE_NAME_ARTIST_ROLE,
	})
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
	@ApiOperation({ summary: 'Get an artist role by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved artist role',
	})
	@ApiResponse({
		status: 404,
		description: ArtistRoleMessageError.NOT_FOUND,
	})
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<ArtistRole>> {
		const result = await this.artistRoleService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of artist roles' })
	@ApiResponse({
		status: 200,
		description: 'List of artist roles',
	})
	async getList(
		@Query() query: QueryGetListArtistRoleDto,
	): Promise<ResponseSuccess<PageDto<ArtistRole>>> {
		const result = await this.artistRoleService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
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
	async update(
		@Param('id') id: string,
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
	@ApiOperation({ summary: 'Delete an artist role by ID' })
	@ApiResponse({
		status: 200,
		description: ArtistRoleMessageSuccess.DELETE,
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.artistRoleService.remove(id);
		return new ResponseSuccess({
			messageCode: ArtistRoleMessageCodeSuccess.DELETE,
		});
	}
}
