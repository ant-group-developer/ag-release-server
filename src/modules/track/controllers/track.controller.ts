import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { TrackMessageCodeSuccess } from '../constants/track.constant';

import {
	QueryGetListTrackDto,
	SubmitCreateTrackDto,
	UpdateTrackDto,
} from '../dto/track.dto';
import { Track } from '../entities/track.entity';
import { ITrack, ITrackNonDraft } from '../interfaces/track.interface';
import { TrackService } from '../services/track.service';

@ApiTags('Tracks')
@Controller('tracks')
export class TrackController {
	constructor(private readonly trackService: TrackService) {}

	@Get()
	async getList(
		@Query() query: QueryGetListTrackDto,
	): Promise<ResponseSuccess<PageDto<Track>>> {
		const result = await this.trackService.getList(query);
		return new ResponseSuccess({ data: result });
	}

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
	async getDetail(@Param('id') id: string): Promise<ResponseSuccess<Track>> {
		const result = await this.trackService.getDetail(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/metadata')
	async getDetailMetadata(
		@Param('id') id: string,
	): Promise<ResponseSuccess<Track>> {
		const result = await this.trackService.getDetailMetadata(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/audio-file')
	async getDetailAudioFile(
		@Param('id') id: string,
	): Promise<ResponseSuccess<Track>> {
		const result = await this.trackService.getDetailAudioFile(id);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
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
}
