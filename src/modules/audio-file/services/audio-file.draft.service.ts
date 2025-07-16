import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioFile } from '../entities/audio-file.entity';

import { BucketService } from 'src/modules/bucket/services/bucket.service';
import {
	IAudioFileDraft,
	ICreateAudioFile,
	IUpdateAudioFile,
} from '../interfaces/audio-file.interface';
import { AudioFileQueryService } from './audio-file.query.service';
import { AudioFileValidateService } from './audio-file.validate.service';

@Injectable()
export class AudioFileDraftService {
	constructor(
		@InjectRepository(AudioFile)
		private readonly audioFileRepo: Repository<AudioFile>,

		private readonly audioFileValidateService: AudioFileValidateService,
		private readonly bucketService: BucketService,
		private readonly audioFileQueryService: AudioFileQueryService,
	) {}

	async create(data: ICreateAudioFile): Promise<IAudioFileDraft> {
		const { trackId, fileId, peakId } = data;

		await this.audioFileValidateService.validate({
			trackId,
			fileId,
			peakId,
		});

		const audioFile = this.audioFileRepo.create(data);
		const result = await this.audioFileRepo.save(audioFile);

		return this.audioFileValidateService.ensureDraftAudioFile(result);
	}

	// async bulkCreate(
	// 	data: BulkCreateAudioFileDraft,
	// ): Promise<IAudioFileDraft[]> {
	// 	const result = [];
	// 	for (const audioFileDraft of data.createAudioFileDraftDtos) {
	// 		result.push(await this.create(audioFileDraft));
	// 	}
	// 	return result;
	// }

	async update({
		audioFileId,
		dataUpdate,
	}: {
		audioFileId: string;
		dataUpdate: IUpdateAudioFile;
	}): Promise<IAudioFileDraft> {
		const { file, ...restOfDataUpdate } = dataUpdate;
		const { fileId, peakId } = restOfDataUpdate;

		const audioFile = await this.audioFileQueryService.findOne(audioFileId);

		if (fileId && fileId !== audioFile.fileId) {
			await this.audioFileValidateService.validate({
				fileId,
			});

			await this.bucketService.remove(audioFile.fileId);
		}

		if (peakId && peakId !== audioFile.peakId) {
			await this.audioFileValidateService.validate({
				peakId,
			});

			await this.bucketService.remove(audioFile.fileId);
		}

		await this.audioFileRepo.update(audioFileId, restOfDataUpdate);
		const result = await this.audioFileQueryService.findOne(audioFileId);

		if (file?.fileName) {
			await this.bucketService.update({
				fileId: audioFile.fileId,
				dataUpdate: { fileName: file.fileName },
			});
		}

		return this.audioFileValidateService.ensureDraftAudioFile(result);
	}
}
