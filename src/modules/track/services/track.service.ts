import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubmitCreateTrackDto, UpdateTrackDto } from '../dto/track.dto';
import { Track } from '../entities/track.entity';
import { ITrack, ITrackNonDraft } from '../interfaces/track.interface';
import { TrackQbService } from './track.qb.service';
import { TrackValidateService } from './track.validate.service';

@Injectable()
export class TrackService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
		private readonly trackValidateService: TrackValidateService,
		private readonly trackQbService: TrackQbService,
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
		await this.trackQbService.findOne(id);

		// validate nonDraft
		const trackNonDraft =
			this.trackValidateService.ensureNonDraftTrack(data);

		await this.trackRepo.update(id, trackNonDraft);
		const result = await this.trackQbService.findOne(id);

		// convert to ITrackNonDraft
		return this.trackValidateService.ensureNonDraftTrack(result);
	}

	// async getDetail(id: string): Promise<ITrackDetail> {
	// 	const track = await this.trackQbService.getDetail(id);

	// 	const { trackCoverArt, ...restOfTrack } = track;

	// 	const coverArtThumbnails = this.getCoverArtThumbnails(trackCoverArt);

	// 	return {
	// 		...restOfTrack,
	// 		coverArtThumbnails,
	// 	};
	// }

	// async getList(query: QueryGetListTrackDto): Promise<PageDto<ITrack>> {
	// 	const { page, pageSize } = query;

	// 	const queryGetList = this.trackQbService.createQueryGetList(query);

	// 	const [tracks, totalItems] = await queryGetList.getManyAndCount();

	// 	return new PageDto({
	// 		items: tracks,
	// 		metadata: {
	// 			currentPage: page,
	// 			pageSize,
	// 			totalItems,
	// 		},
	// 	});
	// }

	async update(id: string, data: UpdateTrackDto): Promise<ITrack> {
		const {
			//  releaseId,
			primaryGenreId,
			subGenreId,
		} = data;

		const track = await this.trackQbService.findOne(id);

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
		return await this.trackQbService.findOne(id);
	}

	// async remove(id: string): Promise<void> {
	// 	await this.trackRepo.delete(id);
	// }

	// private getCoverArtThumbnails(data: TrackCoverArt[]): CoverArtThumbnails {
	// 	const result: CoverArtThumbnails = {
	// 		'75x75': null,
	// 		'100x100': null,
	// 		'160x160': null,
	// 		'300x300': null,
	// 		'900x900': null,
	// 		original: null,
	// 	};

	// 	data.forEach((item) => {
	// 		if (
	// 			[
	// 				'75x75',
	// 				'100x100',
	// 				'160x160',
	// 				'300x300',
	// 				'900x900',
	// 				'original',
	// 			].includes(item.type)
	// 		) {
	// 			result[item.type as keyof CoverArtThumbnails] = item.key;
	// 		}
	// 	});

	// 	return result;
	// }
}
