import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	CreateTrackDraftDto,
	UpdateTrackDraftDto,
} from '../dto/track.draft.dto';
import { Track } from '../entities/track.entity';
import { ITrackDraft } from '../interfaces/track.interface';

import { TrackQueryService } from './track.query.service';
import { TrackValidateService } from './track.validate.service';

@Injectable()
export class TrackDraftService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
		private readonly trackValidateService: TrackValidateService,

		private readonly trackQueryService: TrackQueryService,
	) {}

	async create(data: CreateTrackDraftDto): Promise<ITrackDraft> {
		const { releaseId, primaryGenreId, subGenreId } = data;

		await this.trackValidateService.validate({
			releaseId,
			primaryGenreId,
			subGenreId,
		});

		const track = this.trackRepo.create(data);
		const result = await this.trackRepo.save(track);

		return this.trackValidateService.ensureDraftTrack(result);
	}

	async update(id: string, data: UpdateTrackDraftDto): Promise<ITrackDraft> {
		const {
			// releaseId,
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
		const result = await this.trackQueryService.findOne(id);

		return this.trackValidateService.ensureDraftTrack(result);
	}
}
