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

import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { GenreMessageCodeSuccess } from './constants/genre.constant';
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

	@SystemAdminOnly()
	@Post()
	async create(
		@Body() createGenreDto: CreateGenreDto,
	): Promise<ResponseSuccess<Genre>> {
		const result = await this.genreService.create(createGenreDto);
		return new ResponseSuccess({
			data: result,
			messageCode: GenreMessageCodeSuccess.CREATE,
		});
	}

	@Get()
	async getList(
		@Query() query: QueryGetListGenreDto,
	): Promise<ResponseSuccess<PageDto<Genre>>> {
		const result = await this.genreService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.genreService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Genre>> {
		const result = await this.genreService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
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

	@SystemAdminOnly()
	@Delete(':id')
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.genreService.delete(id);
		return new ResponseSuccess({
			messageCode: GenreMessageCodeSuccess.DELETE,
		});
	}
}
