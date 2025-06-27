import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from './dto/artist.dto';
import { Artist } from './entities/artist.entity';
import { ArtistService } from './services/artist.service';

@Controller('artist')
export class ArtistController {
	constructor(private readonly artistService: ArtistService) {}

	@Post()
	async create(
		@Body() createArtistDto: CreateArtistDto,
	): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.create(createArtistDto);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListArtistDto,
	): Promise<ResponseSuccess<PageDto<Artist>>> {
		const result = await this.artistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Patch(':id')
	async update(
		@Param('id') id: string,
		@Body() updateArtistDto: UpdateArtistDto,
	): Promise<ResponseSuccess<Artist>> {
		const result = await this.artistService.update(id, updateArtistDto);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.artistService.remove(id);

		return new ResponseSuccess();
	}
}
