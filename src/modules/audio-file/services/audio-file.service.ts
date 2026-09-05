import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioFile } from '../entities/audio-file.entity';

import { ResponseError } from 'src/common/dtos/common.response.dto';
import {
	FileEntity,
	OldFileIds,
	ReplaceAudioInput,
	ReplaceAudioParams,
} from 'src/modules/bucket2/entities/bucket.file.entity';
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

	async replace({
		audioFileId,
		data,
	}: ReplaceAudioParams): Promise<IAudioFileDraft> {
		const oldFileIds = await this.replaceInTransaction(audioFileId, data);

		if (oldFileIds) {
			await this.cleanupOldFiles(oldFileIds);
		}

		const result = await this.audioFileQueryService.findOne(audioFileId);
		return this.audioFileQueryService.ensureDraftAudioFile(result);
	}

	private async replaceInTransaction(
		audioFileId: string,
		data: ReplaceAudioInput,
	): Promise<OldFileIds | null> {
		return this.audioFileRepo.manager.transaction(async (manager) => {
			const audioRepo = manager.getRepository(AudioFile);
			const fileRepo = manager.getRepository(FileEntity);

			const audioFile = await audioRepo.findOne({
				where: { id: audioFileId },
			});

			if (!audioFile) {
				throw new ResponseError({
					statusCode: 404,
					message: 'Audio file not found',
				});
			}

			// Idempotent: không update và không cleanup file đang sử dụng.
			if (audioFile.fileId === data.fileId) {
				return null;
			}

			const replacementFile = await fileRepo.findOne({
				where: { id: data.fileId },
			});

			this.validateReplacementFile(replacementFile);
			this.validateAudioSpecification(data);
			await this.ensureFileIsNotUsed(
				audioRepo,
				audioFile.id,
				data.fileId,
			);

			const oldFileIds: OldFileIds = {
				fileId: audioFile.fileId,
				peakId: audioFile.peakId,
			};

			await audioRepo.update(audioFile.id, {
				fileId: data.fileId,
				sampleRate: data.sampleRate,
				bitDepth: data.bitDepth,
				bitrate: data.bitrate ?? null,
				duration: data.duration,
				preview: data.preview,
				sampleLength: data.sampleLength,
				peakId: null,
			});

			return oldFileIds;
		});
	}

	private validateReplacementFile(
		file: FileEntity | null,
	): asserts file is FileEntity {
		if (!file || !file.isSubmitted) {
			throw new ResponseError({
				statusCode: 400,
				message: 'Replacement file is missing or not submitted',
			});
		}

		if (!['wav', 'wave'].includes(file.extension.toLowerCase())) {
			throw new ResponseError({
				statusCode: 400,
				message: 'Replacement file must be WAV',
			});
		}
	}

	private validateAudioSpecification(data: ReplaceAudioInput): void {
		const isValid =
			(data.bitDepth === 16 && data.sampleRate === '44100') ||
			(data.bitDepth === 24 && data.sampleRate === '48000');

		if (!isValid) {
			throw new ResponseError({
				statusCode: 400,
				message: 'Unsupported audio specification',
			});
		}
	}

	private async ensureFileIsNotUsed(
		audioRepo: Repository<AudioFile>,
		currentAudioFileId: string,
		replacementFileId: string,
	): Promise<void> {
		const usedAudioFile = await audioRepo.findOne({
			where: { fileId: replacementFileId },
		});

		if (usedAudioFile && usedAudioFile.id !== currentAudioFileId) {
			throw new ResponseError({
				statusCode: 400,
				message: 'Replacement file is already used',
			});
		}
	}

	private async cleanupOldFiles({
		fileId,
		peakId,
	}: OldFileIds): Promise<void> {
		await this.bucketService.deleteSafe(fileId);

		if (peakId) {
			await this.bucketService.deleteSafe(peakId);
		}
	}
}
