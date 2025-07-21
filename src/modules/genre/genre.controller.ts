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
	GenreMessageCodeSuccess,
	GenreMessageError,
	GenreMessageSuccess,
} from './constants/genre.constant';
import {
	CreateGenreDto,
	QueryGetListGenreDto,
	UpdateGenreDto,
} from './dto/genre.dto';
import { Genre } from './entities/genre.entity';
import { GenreService } from './services/genre.service';

@ApiTags('Genres')
@Controller('genres')
export class GenreController {
	constructor(private readonly genreService: GenreService) {}

	@Post()
	@ApiOperation({ summary: 'Create a new genre' })
	@ApiResponse({ status: 200, description: GenreMessageSuccess.CREATE })
	@ApiResponse({
		status: 409,
		description: GenreMessageError.DUPLICATE_NAME_GENRE,
	})
	async create(
		@Body() createGenreDto: CreateGenreDto,
	): Promise<ResponseSuccess<Genre>> {
		const result = await this.genreService.create(createGenreDto);
		return new ResponseSuccess({
			data: result,
			messageCode: GenreMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a genre by ID' })
	@ApiResponse({ status: 200, description: 'Successfully retrieved genre' })
	@ApiResponse({ status: 404, description: GenreMessageError.NOT_FOUND })
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Genre>> {
		const result = await this.genreService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of genres' })
	@ApiResponse({ status: 200, description: 'List of genres' })
	async getList(
		@Query() query: QueryGetListGenreDto,
	): Promise<ResponseSuccess<PageDto<Genre>>> {
		const result = await this.genreService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a genre by ID' })
	@ApiResponse({ status: 200, description: GenreMessageSuccess.UPDATE })
	@ApiResponse({
		status: 409,
		description: GenreMessageError.DUPLICATE_NAME_GENRE,
	})
	@ApiResponse({ status: 404, description: GenreMessageError.NOT_FOUND })
	async update(
		@Param('id') id: string,
		@Body() updateGenreDto: UpdateGenreDto,
	): Promise<ResponseSuccess<Genre>> {
		const result = await this.genreService.update(id, updateGenreDto);
		return new ResponseSuccess({
			data: result,
			messageCode: GenreMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a genre by ID' })
	@ApiResponse({ status: 200, description: GenreMessageSuccess.DELETE })
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.genreService.delete(id);
		return new ResponseSuccess({
			messageCode: GenreMessageCodeSuccess.DELETE,
		});
	}
}
