import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';

import {
	CreateAudioFileDraftDto,
	UpdateAudioFileDraftDto,
} from '../dto/audio-file.draft.dto';

import { AudioFileMessageCodeSuccess } from '../constants/audio-file.constant';
import { IAudioFileDraft } from '../interfaces/audio-file.interface';
import { AudioFileDraftService } from '../services/audio-file.draft.service';

@ApiTags('Audio file draft')
@Controller('audio-file/draft')
export class AudioFileDraftController {
	constructor(
		private readonly audioFileDraftService: AudioFileDraftService,
	) {}

	@Post()
	async create(
		@Body() data: CreateAudioFileDraftDto,
	): Promise<ResponseSuccess<IAudioFileDraft>> {
		const result = await this.audioFileDraftService.create(data);

		return new ResponseSuccess({
			data: result,
			messageCode: AudioFileMessageCodeSuccess.CREATE,
		});
	}

	// @Post('bulk')
	// async bulkCreate(
	// 	@Body() data: CreateAudioFileDraftDto,
	// ): Promise<ResponseSuccess<IAudioFileDraft>> {
	// 	const result = await this.audioFileDraftService.create(data);

	// 	return new ResponseSuccess({
	// 		data: result,
	// 		messageCode: AudioFileMessageCodeSuccess.CREATE,
	// 	});
	// }

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() data: UpdateAudioFileDraftDto,
	): Promise<ResponseSuccess<IAudioFileDraft>> {
		const result = await this.audioFileDraftService.update(id, data);
		return new ResponseSuccess({
			data: result,
			messageCode: AudioFileMessageCodeSuccess.UPDATE,
		});
	}
}
