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
import { ReleaseArtistMessageCodeSuccess } from './constants/release-artist.constant';

import {
	CreateReleaseArtistDto,
	QueryGetListReleaseArtistDto,
	UpdateReleaseArtistDto,
} from './dto/release-artist.dto';
import { ReleaseArtist } from './entities/release-artist.entity';
import { ReleaseArtistService } from './services/release-artist.service';

@ApiTags('Release Artists')
@Controller('release-artists')
export class ReleaseArtistController {
	constructor(private readonly releaseArtistService: ReleaseArtistService) {}

	@Post()
	async create(
		@Body() createReleaseArtistDto: CreateReleaseArtistDto,
	): Promise<ResponseSuccess<ReleaseArtist>> {
		const result = await this.releaseArtistService.create(
			createReleaseArtistDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseArtistMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<ReleaseArtist>> {
		const result = await this.releaseArtistService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListReleaseArtistDto,
	): Promise<ResponseSuccess<PageDto<ReleaseArtist>>> {
		const result = await this.releaseArtistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateReleaseArtistDto: UpdateReleaseArtistDto,
	): Promise<ResponseSuccess<ReleaseArtist>> {
		const result = await this.releaseArtistService.update(
			id,
			updateReleaseArtistDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseArtistMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.releaseArtistService.handleDelete(id);
		return new ResponseSuccess({
			messageCode: ReleaseArtistMessageCodeSuccess.DELETE,
		});
	}
}
