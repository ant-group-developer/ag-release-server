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
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { TrackArtistMessageCodeSuccess } from './constants/track-artist.constant';

import {
	CreateTrackArtistDto,
	QueryGetListTrackArtistDto,
	UpdateTrackArtistDto,
} from './dto/track-artist.dto';
import { TrackArtist } from './entities/track-artist.entity';
import { TrackArtistService } from './services/track-artist.service';

@ApiTags('Track Artists')
@Controller('track-artists')
export class TrackArtistController {
	constructor(private readonly trackArtistService: TrackArtistService) {}

	@Post()
	async create(
		@Body() createTrackArtistDto: CreateTrackArtistDto,
	): Promise<ResponseSuccess<TrackArtist>> {
		const result =
			await this.trackArtistService.create(createTrackArtistDto);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackArtistMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<TrackArtist>> {
		const result = await this.trackArtistService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListTrackArtistDto,
	): Promise<ResponseSuccess<PageDto<TrackArtist>>> {
		const result = await this.trackArtistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateTrackArtistDto: UpdateTrackArtistDto,
	): Promise<ResponseSuccess<TrackArtist>> {
		const result = await this.trackArtistService.update(
			id,
			updateTrackArtistDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackArtistMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.trackArtistService.delete(id);
		return new ResponseSuccess({
			messageCode: TrackArtistMessageCodeSuccess.DELETE,
		});
	}
}
