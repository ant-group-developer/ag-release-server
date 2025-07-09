import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import {
	IAudioFile,
	IAudioFileBucket,
} from 'src/modules/audio-file/interfaces/audio-file.interface';
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
	ITrackAudioBucket,
	ITrackNonDraft,
	ITrackWithAudio,
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
		const trackNonDraft =
			this.trackValidateService.ensureNonDraftTrack(data);

		await this.trackRepo.update(id, trackNonDraft);
		const result = await this.trackQueryService.findOne(id);

		// convert to ITrackNonDraft
		return this.trackValidateService.ensureNonDraftTrack(result);
	}

	async getDetail(id: string): Promise<ITrackAudioBucket> {
		const track = await this.trackQueryService.getDetail(id);

		const { audioFile, ...restOfTrack } = track;

		const audioFileBucket = audioFile
			? await this.getAudioFileBucket(audioFile)
			: null;

		return {
			...restOfTrack,
			audioFileBucket,
		};
	}

	async getList(
		query: QueryGetListTrackDto,
	): Promise<PageDto<ITrackAudioBucket>> {
		const { page, pageSize } = query;

		const queryGetList = this.trackQueryService.createQueryGetList(query);

		const [tracks, totalItems] = await queryGetList.getManyAndCount();

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

	async getAudioFileBucket(audioFile: IAudioFile): Promise<IAudioFileBucket> {
		const file = await this.bucketService.getUrlRead(audioFile.fileId);
		const peak = await this.bucketService.getUrlRead(audioFile.peakId);

		return {
			...audioFile,
			file,
			peak,
		};
	}

	async getTracksAudioBucket(
		tracks: ITrackWithAudio[],
	): Promise<ITrackAudioBucket[]> {
		const result: ITrackAudioBucket[] = [];
		for (const track of tracks) {
			const { audioFile, ...restOfTrack } = track;

			const audioFileBucket = audioFile
				? await this.getAudioFileBucket(audioFile)
				: null;

			result.push({
				...restOfTrack,
				audioFileBucket,
			});
		}

		return result;
	}
}
