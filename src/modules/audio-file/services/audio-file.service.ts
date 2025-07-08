import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
	SubmitCreateAudioFileDto,
	UpdateAudioFileDto,
} from '../dto/audio-file.dto';
import { AudioFile } from '../entities/audio-file.entity';
import { IAudioFileNonDraft } from '../interfaces/audio-file.interface';
import { AudioFileQueryService } from './audio-file.query.service';
import { AudioFileValidateService } from './audio-file.validate.service';

@Injectable()
export class AudioFileService {
	constructor(
		@InjectRepository(AudioFile)
		private readonly audioFileRepo: Repository<AudioFile>,
		private readonly audioFileValidateService: AudioFileValidateService,
		private readonly audioFileQueryService: AudioFileQueryService,
	) {}

	async submit(
		id: string,
		data: SubmitCreateAudioFileDto,
	): Promise<IAudioFileNonDraft> {
		// validate id
		await this.audioFileQueryService.findOne(id);

		// validate nonDraft
		const audioFileNonDraft =
			this.audioFileValidateService.ensureNonDraftAudioFile(data);

		await this.audioFileRepo.update(id, audioFileNonDraft);
		const result = await this.audioFileQueryService.findOne(id);

		// convert to IAudioFileNonDraft
		return this.audioFileValidateService.ensureNonDraftAudioFile(result);
	}

	// async getDetail(id: string): Promise<IAudioFileDetail> {
	// 	const audioFile = await this.audioFileQbService.getDetail(id);

	// 	const { audioFileCoverArt, ...restOfAudioFile } = audioFile;

	// 	const coverArtThumbnails = this.getCoverArtThumbnails(audioFileCoverArt);

	// 	return {
	// 		...restOfAudioFile,
	// 		coverArtThumbnails,
	// 	};
	// }

	// async getList(query: QueryGetListAudioFileDto): Promise<PageDto<IAudioFile>> {
	// 	const { page, pageSize } = query;

	// 	const queryGetList = this.audioFileQbService.createQueryGetList(query);

	// 	const [audioFiles, totalItems] = await queryGetList.getManyAndCount();

	// 	return new PageDto({
	// 		items: audioFiles,
	// 		metadata: {
	// 			currentPage: page,
	// 			pageSize,
	// 			totalItems,
	// 		},
	// 	});
	// }

	async update(
		id: string,
		data: UpdateAudioFileDto,
	): Promise<IAudioFileNonDraft> {
		const { trackId, fileId, peakId } = data;

		const audioFile = await this.audioFileQueryService.findOne(id);

		if (trackId && trackId !== audioFile.trackId) {
			await this.audioFileValidateService.validate({
				trackId,
			});
		}

		if (fileId && fileId !== audioFile.fileId) {
			await this.audioFileValidateService.validate({
				fileId,
			});
		}

		if (peakId && peakId !== audioFile.peakId) {
			await this.audioFileValidateService.validate({
				peakId,
			});
		}

		await this.audioFileRepo.update(id, data);
		const result = await this.audioFileQueryService.findOne(id);

		return this.audioFileValidateService.ensureNonDraftAudioFile(result);
	}
}
