import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { IAudioFileBucket } from 'src/modules/audio-file/interfaces/audio-file.interface';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import {
	QueryGetListTrackDto,
	SubmitCreateTrackDto,
	UpdateTrackDto,
} from '../dto/track.dto';
import { Track } from '../entities/track.entity';
import {
	ITrack,
	ITrackDetails,
	ITrackNonDraft,
} from '../interfaces/track.interface';
import { TrackQueryService } from './track.query.service';
import { TrackValidateService } from './track.validate.service';

@Injectable()
export class TrackService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
		private readonly trackValidateService: TrackValidateService,
		private readonly trackQueryService: TrackQueryService,
		private readonly bucketService: BucketService,
	) {}

	// async create(data: CreateTrackDto): Promise<Track> {
	// 	const { labelId, primaryGenreId, subGenreId, trackTimezoneId } = data;

	// 	await this.trackValidateService.validate({
	// 		labelId,
	// 		primaryGenreId,
	// 		subGenreId,
	// 		trackTimezoneId,
	// 	});

	// 	const track = this.trackRepo.create(data);
	// 	return await this.trackRepo.save(track);
	// }

	async submit(
		id: string,
		data: SubmitCreateTrackDto,
	): Promise<ITrackNonDraft> {
		// validate id
		await this.trackQueryService.findOne(id);

		// validate nonDraft
		const trackNonDraft = this.trackValidateService.ensureNonDraftTrack({
			...data,
			trackArtists: [],
		});

		await this.trackRepo.update(id, trackNonDraft);
		const result = await this.trackQueryService.findOne(id);

		// convert to ITrackNonDraft
		return this.trackValidateService.ensureNonDraftTrack(result);
	}

	async getDetail(id: string): Promise<ITrackDetails> {
		const track = await this.trackQueryService.getDetail(id);

		const { audioFile, ...restOfTrack } = track;

		const audioFileBucket = audioFile
			? await this.getAudioFileBucket(audioFile)
			: null;

		return {
			...restOfTrack,
			audioFile: audioFileBucket,
		};
	}

	async getList(
		query: QueryGetListTrackDto,
	): Promise<PageDto<ITrackDetails>> {
		const { page, pageSize } = query;

		const [tracks, totalItems] =
			await this.trackQueryService.getList(query);

		return new PageDto({
			items: await this.getTracksAudioBucket(tracks),
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, data: UpdateTrackDto): Promise<ITrack> {
		const {
			//  releaseId,
			primaryGenreId,
			subGenreId,
		} = data;

		const track = await this.trackQueryService.findOne(id);

		// if (releaseId && releaseId !== track.releaseId) {
		// 	await this.trackValidateService.validate({
		// 		releaseId,
		// 	});
		// }

		if (primaryGenreId && primaryGenreId !== track.primaryGenreId) {
			await this.trackValidateService.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== track.subGenreId) {
			await this.trackValidateService.validate({
				subGenreId,
			});
		}

		await this.trackRepo.update(id, data);
		return await this.trackQueryService.findOne(id);
	}

	async getAudioFileBucket(audioFile: AudioFile): Promise<IAudioFileBucket> {
		const { file, peak } = audioFile;

		const urlReadFile = await this.bucketService.getUrlRead(file.id);
		const urlReadPeak = await this.bucketService.getUrlRead(peak.id);

		return {
			...audioFile,
			file: {
				...file,
				urlRead: urlReadFile,
			},
			peak: {
				...peak,
				urlRead: urlReadPeak,
			},
		};
	}

	async getTracksAudioBucket(tracks: Track[]) {
		const result = [];
		for (const track of tracks) {
			const { audioFile, ...restOfTrack } = track;

			const audioFileBucket = audioFile
				? await this.getAudioFileBucket(audioFile)
				: null;

			result.push({
				...restOfTrack,
				audioFile: audioFileBucket,
			});
		}

		return result;
	}

	async remove(id: string) {
		await this.trackRepo.delete(id);
		// xoa con
	}
}
