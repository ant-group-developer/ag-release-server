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
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateGenreDto,
	QueryGetListGenreDto,
	UpdateGenreDto,
} from './dto/genre.dto';
import { Genre } from './entities/genre.entity';
import { GenreService } from './genre.service';

@Controller('genres')
export class GenreController {
	constructor(private readonly genreService: GenreService) {}

	@Post()
	async create(
		@Body() createGenreDto: CreateGenreDto,
	): Promise<ResponseSuccess<Genre>> {
		const result = await this.genreService.create(createGenreDto);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Genre>> {
		const result = await this.genreService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListGenreDto,
	): Promise<ResponseSuccess<PageDto<Genre>>> {
		const result = await this.genreService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateGenreDto: UpdateGenreDto,
	): Promise<Genre> {
		return await this.genreService.update(id, updateGenreDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.genreService.remove(id);
	}
}
