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
	ArtistMessageCodeSuccess,
	ArtistMessageError,
	ArtistMessageSuccess,
} from './constants/artist.constant';
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

	@Post()
	@ApiOperation({ summary: 'Create a new artist' })
	@ApiResponse({ status: 200, description: ArtistMessageSuccess.CREATE })
	@ApiResponse({
		status: 409,
		description: ArtistMessageError.DUPLICATE_NAME_ARTIST,
	})
	async create(
		@Body() createArtistDto: CreateArtistDto,
	): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.create(createArtistDto);
		return new ResponseSuccess({
			data: result,
			messageCode: ArtistMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get an artist by ID' })
	@ApiResponse({ status: 200, description: 'Successfully retrieved artist' })
	@ApiResponse({ status: 404, description: ArtistMessageError.NOT_FOUND })
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of artists' })
	@ApiResponse({ status: 200, description: 'List of artists' })
	async getList(
		@Query() query: QueryGetListArtistDto,
	): Promise<ResponseSuccess<PageDto<Artist>>> {
		const result = await this.artistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update an artist by ID' })
	@ApiResponse({ status: 200, description: ArtistMessageSuccess.UPDATE })
	@ApiResponse({
		status: 409,
		description: ArtistMessageError.DUPLICATE_NAME_ARTIST,
	})
	@ApiResponse({ status: 404, description: ArtistMessageError.NOT_FOUND })
	async update(
		@Param('id') id: string,
		@Body() updateArtistDto: UpdateArtistDto,
	): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.update(id, updateArtistDto);
		return new ResponseSuccess({
			data: result,
			messageCode: ArtistMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete an artist by ID' })
	@ApiResponse({ status: 200, description: ArtistMessageSuccess.DELETE })
	@ApiResponse({ status: 404, description: ArtistMessageError.NOT_FOUND })
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.artistService.remove(id);
		return new ResponseSuccess({
			messageCode: ArtistMessageCodeSuccess.DELETE,
		});
	}
}
