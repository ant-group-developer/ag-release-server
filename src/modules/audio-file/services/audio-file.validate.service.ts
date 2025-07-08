import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { FileEntity } from 'src/modules/bucket/entities/bucket.file.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import { AudioFile } from '../entities/audio-file.entity';
import {
	IAudioFile,
	IAudioFileDraft,
	IAudioFileNonDraft,
} from '../interfaces/audio-file.interface';

@Injectable()
export class AudioFileValidateService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		@InjectRepository(FileEntity)
		private readonly fileRepo: Repository<FileEntity>,

		@InjectRepository(AudioFile)
		private readonly audioFileRepo: Repository<AudioFile>,
	) {}

	async validate({
		trackId,
		peakId,
		fileId,
	}: {
		trackId?: string | null;
		peakId?: string | null;
		fileId?: string | null;
	}) {
		if (trackId) {
			const track = await this.trackRepo.findOne({
				where: { id: trackId },
			});

			const audioFile = await this.audioFileRepo.findOne({
				where: { trackId },
			});

			if (!track || audioFile) {
				throw new ResponseError({
					message: 'Invalid trackId',
				});
			}
		}

		if (peakId === fileId) {
			throw new ResponseError({
				message: 'Invalid peakId, fileId',
			});
		}

		if (peakId) {
			const peak = await this.fileRepo.findOne({
				where: { id: peakId },
			});

			if (!peak) {
				throw new ResponseError({
					message: 'Peak not found',
				});
			}
		}

		if (fileId) {
			const file = await this.fileRepo.findOne({
				where: { id: fileId },
			});

			if (!file) {
				throw new ResponseError({
					message: 'File not found',
				});
			}
		}
	}

	ensureNonDraftAudioFile(audioFile: IAudioFile): IAudioFileNonDraft {
		// if (audioFile.status === AudioFileStatus.DRAFT) {
		// 	throw new ResponseError({ message: 'Invalid audioFile.status' });
		// }

		if (!audioFile.bitrate || !audioFile.bitDepth || !audioFile.hook) {
			throw new ResponseError({
				message: 'Audio file is draft',
			});
		}

		return audioFile as IAudioFileNonDraft;
	}

	ensureDraftAudioFile(audioFile: IAudioFile): IAudioFileDraft {
		// if (audioFile.status !== AudioFileStatus.DRAFT) {
		// 	throw new ResponseError({
		// 		message: 'Invalid audioFile.status',
		// 	});
		// }

		return audioFile as IAudioFileDraft;
	}
}
