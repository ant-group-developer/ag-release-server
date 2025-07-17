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
	TrackArtistMessageCodeSuccess,
	TrackArtistMessageError,
	TrackArtistMessageSuccess,
} from './constants/track-artist.constant';

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
	@ApiOperation({ summary: 'Create a new track artist' })
	@ApiResponse({
		status: 200,
		description: TrackArtistMessageSuccess.CREATE,
	})
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
	@ApiOperation({ summary: 'Get a track artist by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved track artist',
	})
	@ApiResponse({
		status: 404,
		description: TrackArtistMessageError.NOT_FOUND,
	})
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<TrackArtist>> {
		const result = await this.trackArtistService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of track artist' })
	@ApiResponse({
		status: 200,
		description: 'List of track artist',
	})
	async getList(
		@Query() query: QueryGetListTrackArtistDto,
	): Promise<ResponseSuccess<PageDto<TrackArtist>>> {
		const result = await this.trackArtistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a track artist by ID' })
	@ApiResponse({
		status: 200,
		description: TrackArtistMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 404,
		description: TrackArtistMessageError.NOT_FOUND,
	})
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
	@ApiOperation({ summary: 'Delete a track artist by ID' })
	@ApiResponse({
		status: 200,
		description: TrackArtistMessageSuccess.DELETE,
	})
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.trackArtistService.delete(id);
		return new ResponseSuccess({
			messageCode: TrackArtistMessageCodeSuccess.DELETE,
		});
	}
}
