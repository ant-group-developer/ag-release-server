import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	TrackMessageCodeSuccess,
	TrackMessageError,
	TrackMessageSuccess,
} from '../constants/track.constant';

import {
	QueryGetListTrackDto,
	SubmitCreateTrackDto,
	UpdateTrackDto,
} from '../dto/track.dto';
import {
	ITrack,
	ITrackAudioBucket,
	ITrackNonDraft,
} from '../interfaces/track.interface';
import { TrackService } from '../services/track.service';

@ApiTags('Tracks')
@Controller('tracks')
export class TrackController {
	constructor(private readonly trackService: TrackService) {}

	// @Post()
	// @ApiOperation({ summary: 'Create a new track' })
	// @ApiResponse({
	// 	status: 200,
	// 	description: TrackMessageSuccess.CREATE,
	// })
	// @ApiResponse({
	// 	status: 400,
	// 	description: TrackMessageError.PRIMARY_GENRE_NOT_FOUND,
	// })
	// async create(
	// 	@Body() createTrackDto: CreateTrackDto,
	// ): Promise<ResponseSuccess<Track>> {
	// 	const result = await this.trackService.create(createTrackDto);
	// 	return new ResponseSuccess({
	// 		data: result,
	// 		messageCode: TrackMessageCodeSuccess.CREATE,
	// 	});
	// }

	@Post(':id/submit')
	async submit(
		@Param('id') id: string,
		@Body() data: SubmitCreateTrackDto,
	): Promise<ResponseSuccess<ITrackNonDraft>> {
		const result = await this.trackService.submit(id, data);

		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async getDetail(
		@Param('id') id: string,
	): Promise<ResponseSuccess<ITrackAudioBucket>> {
		const result = await this.trackService.getDetail(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of tracks' })
	@ApiResponse({
		status: 200,
		description: 'List of tracks',
	})
	async getList(
		@Query() query: QueryGetListTrackDto,
	): Promise<ResponseSuccess<PageDto<ITrackAudioBucket>>> {
		const result = await this.trackService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a track by ID' })
	@ApiResponse({
		status: 200,
		description: TrackMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 404,
		description: TrackMessageError.NOT_FOUND,
	})
	@ApiResponse({
		status: 400,
		description: TrackMessageError.PRIMARY_GENRE_NOT_FOUND,
	})
	async update(
		@Param('id') id: string,
		@Body() updateTrackDto: UpdateTrackDto,
	): Promise<ResponseSuccess<ITrack>> {
		const result = await this.trackService.update(id, updateTrackDto);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.UPDATE,
		});
	}

	// @Delete(':id')
	// @ApiOperation({ summary: 'Delete a track by ID' })
	// @ApiResponse({
	// 	status: 200,
	// 	description: TrackMessageSuccess.DELETE,
	// })
	// async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
	// 	await this.trackService.remove(id);
	// 	return new ResponseSuccess({
	// 		messageCode: TrackMessageCodeSuccess.DELETE,
	// 	});
	// }
}
