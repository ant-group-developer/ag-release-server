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
import { PageDto, ResponseSuccessDto } from 'src/common/dtos/response.dto';
import { ArtistService } from './artist.service';
import {
	CreateArtistDto,
	QueryGetListArtistDto,
	UpdateArtistDto,
} from './dto/artist.dto';
import { Artist } from './entities/artist.entity';

@Controller('asrtist')
export class ArtistController {
	constructor(private readonly artistService: ArtistService) {}

	@Post()
	async create(
		@Body() createArtistDto: CreateArtistDto,
	): Promise<ResponseSuccessDto<Artist>> {
		const result = await this.artistService.create(createArtistDto);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccessDto<Artist>> {
		const result = await this.artistService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListArtistDto,
	): Promise<ResponseSuccessDto<PageDto<Artist>>> {
		const result = await this.artistService.getList(query);
		return new ResponseSuccessDto({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateArtistDto: UpdateArtistDto,
	): Promise<Artist> {
		return await this.artistService.update(id, updateArtistDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.artistService.remove(id);
	}
}
