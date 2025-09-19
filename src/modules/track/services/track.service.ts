import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { getCoverArtThumbnails } from 'src/utils/util';
import { Repository } from 'typeorm';
import {
	QueryGetListTrackDto,
	SubmitCreateTrackDto,
	UpdateTrackDto,
} from '../dto/track.dto';
import { Track } from '../entities/track.entity';
import { ITrack, ITrackNonDraft } from '../interfaces/track.interface';
import { TrackQueryService } from './track.query.service copy';

@Injectable()
export class TrackService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
		private readonly trackQueryService: TrackQueryService,
	) {}

	async submit(
		id: string,
		data: SubmitCreateTrackDto,
	): Promise<ITrackNonDraft> {
		// validate id
		await this.trackQueryService.findOne(id);

		// validate nonDraft
		const trackNonDraft = this.trackQueryService.ensureNonDraftTrack({
			...data,
			trackArtists: [],
		});

		await this.trackRepo.update(id, trackNonDraft);
		const result = await this.trackQueryService.findOne(id);

		// convert to ITrackNonDraft
		return this.trackQueryService.ensureNonDraftTrack(result);
	}

	// read
	async getDetail(id: string): Promise<Track> {
		const trackDb = await this.trackQueryService.getDetailOne(id);
		return this.enhanceDetailsOne(trackDb);
	}

	async getDetailMetadata(id: string): Promise<Track> {
		return await this.trackQueryService.getDetailMetadataOne(id);
	}

	async getDetailAudioFile(id: string): Promise<Track> {
		return await this.trackQueryService.getDetailAudioFileOne(id);
	}

	async getList(query: QueryGetListTrackDto): Promise<PageDto<Track>> {
		const { page, pageSize } = query;

		const [tracksDb, totalItems] =
			await this.trackQueryService.getList(query);

		const enhancedTracks = this.enhanceDetailsList(tracksDb);

		return new PageDto({
			items: enhancedTracks,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListWithRevenue(
		query: QueryGetListTrackDto,
	): Promise<PageDto<Track>> {
		const { page, pageSize } = query;

		const [tracksDb, totalItems] =
			await this.trackQueryService.getList(query);

		const enhancedTracks = this.enhanceDetailsList(tracksDb);

		return new PageDto({
			items: enhancedTracks,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	// enhance
	private enhanceDetailsOne(track: Track) {
		track.release.coverArtThumbnails = getCoverArtThumbnails(
			track.release.releaseCoverArts,
		);

		track.release.releaseCoverArts = undefined;
		return track;
	}

	private enhanceDetailsList(tracks: Track[]) {
		return tracks.map((track) => this.enhanceDetailsOne(track));
	}

	// update
	async update(id: string, data: UpdateTrackDto): Promise<ITrack> {
		const {
			//  releaseId,
			primaryGenreId,
			subGenreId,
		} = data;

		const track = await this.trackQueryService.findOne(id);

		if (primaryGenreId && primaryGenreId !== track.primaryGenreId) {
			await this.trackQueryService.validateForeignKey({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== track.subGenreId) {
			await this.trackQueryService.validateForeignKey({
				subGenreId,
			});
		}

		await this.trackRepo.update(id, data);
		return await this.trackQueryService.findOne(id);
	}
}
