import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioFile } from '../entities/audio-file.entity';

import { ResponseError } from 'src/common/dtos/common.response.dto';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import {
	IAudioFileDraft,
	ICreateAudioFile,
	IUpdateAudioFile,
} from '../interfaces/audio-file.interface';
import { AudioFileQueryService } from './audio-file.query.service';

@Injectable()
export class AudioFileService {
	private readonly logger = new Logger(AudioFileService.name);

	constructor(
		@InjectRepository(AudioFile)
		private readonly audioFileRepo: Repository<AudioFile>,

		private readonly bucketService: BucketService2,
		private readonly audioFileQueryService: AudioFileQueryService,
	) {}

	async create(data: ICreateAudioFile): Promise<IAudioFileDraft> {
		const { trackId, fileId, peakId } = data;

		await this.audioFileQueryService.validate({
			trackId,
			fileId,
			peakId,
		});

		const audioFile = this.audioFileRepo.create(data);
		const result = await this.audioFileRepo.save(audioFile);

		return this.audioFileQueryService.ensureDraftAudioFile(result);
	}

	async update({
		audioFileId,
		dataUpdate,
	}: {
		audioFileId: string;
		dataUpdate: IUpdateAudioFile;
	}): Promise<IAudioFileDraft> {
		const { file, ...restOfDataUpdate } = dataUpdate;
		const { fileId, peakId, preview, sampleLength } = restOfDataUpdate;

		const audioFile = await this.audioFileQueryService.findOne(audioFileId);

		if (preview && preview > audioFile.duration) {
			throw new ResponseError({
				message: 'Preview cannot be greater than the original duration',
			});
		}

		if (
			sampleLength &&
			sampleLength + (preview ?? audioFile.preview ?? 0) >
				audioFile.duration
		) {
			throw new ResponseError({
				message:
					'Preview + Sample length cannot be greater than the original duration',
			});
		}

		if (fileId && fileId !== audioFile.fileId) {
			await this.audioFileQueryService.validate({
				fileId,
			});

			await this.bucketService.delete(audioFile.fileId);
		}

		if (peakId && peakId !== audioFile.peakId) {
			await this.audioFileQueryService.validate({
				peakId,
			});

			await this.bucketService.delete(audioFile.fileId);
		}

		await this.audioFileRepo.update(audioFileId, restOfDataUpdate);
		const result = await this.audioFileQueryService.findOne(audioFileId);

		if (file?.fileName) {
			await this.bucketService.update({
				fileId: audioFile.fileId,
				dataUpdate: { fileName: file.fileName },
			});
		}

		return this.audioFileQueryService.ensureDraftAudioFile(result);
	}

	// delete
	async deleteRecordOfTrackSafe({ trackId }: { trackId: string }) {
		await this.deleteRecordOfTrack({ trackId }).catch((_e) => {
			this.logger.log(_e.message);
		});
	}

	async deleteRecordOfTrack({ trackId }: { trackId: string }) {
		const audioFileOfTrack =
			await this.audioFileQueryService.getAudioFileOfTrack({
				trackId,
			});

		await this.handleDelete(audioFileOfTrack.id);
	}

	async handleDelete(id: string) {
		const audioFile = await this.audioFileQueryService.findOne(id);
		await this.audioFileRepo.delete(id);
		await this.deleteAudioAndPeak(audioFile);
	}

	async deleteAudioAndPeak(audioFile: AudioFile) {
		await this.bucketService.deleteSafe(audioFile.fileId);
		if (audioFile.peakId)
			await this.bucketService.deleteSafe(audioFile.peakId);
	}
}
