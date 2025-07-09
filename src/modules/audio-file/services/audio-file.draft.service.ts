import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	CreateAudioFileDraftDto,
	UpdateAudioFileDraftDto,
} from '../dto/audio-file.draft.dto';
import { AudioFile } from '../entities/audio-file.entity';

import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { IAudioFileDraft } from '../interfaces/audio-file.interface';
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

	async create(data: CreateAudioFileDraftDto): Promise<IAudioFileDraft> {
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

	async update(
		id: string,
		data: UpdateAudioFileDraftDto,
	): Promise<IAudioFileDraft> {
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

			await this.bucketService.remove(audioFile.fileId);
		}

		if (peakId && peakId !== audioFile.peakId) {
			await this.audioFileValidateService.validate({
				peakId,
			});

			await this.bucketService.remove(audioFile.fileId);
		}

		await this.audioFileRepo.update(id, data);
		const result = await this.audioFileQueryService.findOne(id);

		return this.audioFileValidateService.ensureDraftAudioFile(result);
	}
}
