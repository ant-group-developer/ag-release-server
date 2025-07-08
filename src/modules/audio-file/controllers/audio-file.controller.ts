import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { AudioFileMessageCodeSuccess } from '../constants/audio-file.constant';
import {
	SubmitCreateAudioFileDto,
	UpdateAudioFileDto,
} from '../dto/audio-file.dto';
import {
	IAudioFile,
	IAudioFileNonDraft,
} from '../interfaces/audio-file.interface';
import { AudioFileService } from '../services/audio-file.service';

@ApiTags('Audio file')
@Controller('audio-file')
export class AudioFileController {
	constructor(private readonly audioFileService: AudioFileService) {}

	// @Post()
	// @ApiOperation({ summary: 'Create a new audioFile' })
	// @ApiResponse({
	// 	status: 200,
	// 	description: AudioFileMessageSuccess.CREATE,
	// })
	// @ApiResponse({
	// 	status: 400,
	// 	description: AudioFileMessageError.PRIMARY_GENRE_NOT_FOUND,
	// })
	// async create(
	// 	@Body() createAudioFileDto: CreateAudioFileDto,
	// ): Promise<ResponseSuccess<AudioFile>> {
	// 	const result = await this.audioFileService.create(createAudioFileDto);
	// 	return new ResponseSuccess({
	// 		data: result,
	// 		messageCode: AudioFileMessageCodeSuccess.CREATE,
	// 	});
	// }

	@Post(':id/submit')
	async submit(
		@Param('id') id: string,
		@Body() data: SubmitCreateAudioFileDto,
	): Promise<ResponseSuccess<IAudioFileNonDraft>> {
		const result = await this.audioFileService.submit(id, data);

		return new ResponseSuccess({
			data: result,
			messageCode: AudioFileMessageCodeSuccess.CREATE,
		});
	}

	// @Get(':id')
	// @ApiOperation({ summary: 'Get a audioFile by ID' })
	// @ApiResponse({
	// 	status: 200,
	// 	description: 'Successfully retrieved audioFile',
	// })
	// @ApiResponse({
	// 	status: 404,
	// 	description: AudioFileMessageError.NOT_FOUND,
	// })
	// async getDetail(
	// 	@Param('id') id: string,
	// ): Promise<ResponseSuccess<IAudioFileDetail>> {
	// 	const result = await this.audioFileService.getDetail(id);
	// 	return new ResponseSuccess({ data: result });
	// }

	// @Get()
	// @ApiOperation({ summary: 'Get a list of audioFiles' })
	// @ApiResponse({
	// 	status: 200,
	// 	description: 'List of audioFiles',
	// })
	// async getList(
	// 	@Query() query: QueryGetListAudioFileDto,
	// ): Promise<ResponseSuccess<PageDto<IAudioFile>>> {
	// 	const result = await this.audioFileService.getList(query);
	// 	return new ResponseSuccess({ data: result });
	// }

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateAudioFileDto: UpdateAudioFileDto,
	): Promise<ResponseSuccess<IAudioFile>> {
		const result = await this.audioFileService.update(
			id,
			updateAudioFileDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: AudioFileMessageCodeSuccess.UPDATE,
		});
	}

	// @Delete(':id')
	// @ApiOperation({ summary: 'Delete a audioFile by ID' })
	// @ApiResponse({
	// 	status: 200,
	// 	description: AudioFileMessageSuccess.DELETE,
	// })
	// async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
	// 	await this.audioFileService.remove(id);
	// 	return new ResponseSuccess({
	// 		messageCode: AudioFileMessageCodeSuccess.DELETE,
	// 	});
	// }
}
