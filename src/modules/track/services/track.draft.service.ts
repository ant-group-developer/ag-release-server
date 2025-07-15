import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	BulkCreateTrackDraft,
	BulkUpdateTrackDraft,
	CreateTrackDraftDto,
	UpdateTrackDraftDto,
} from '../dto/track.draft.dto';
import { Track } from '../entities/track.entity';
import { ITrackDraft } from '../interfaces/track.interface';

import { AudioFileDraftService } from 'src/modules/audio-file/services/audio-file.draft.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackLanguageDraftService } from 'src/modules/track-language/services/track-language.draft.service';
import { TrackQueryService } from './track.query.service';
import { TrackValidateService } from './track.validate.service';

@Injectable()
export class TrackDraftService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(TrackArtist)
		private readonly trackArtistRepo: Repository<TrackArtist>,

		private readonly trackValidateService: TrackValidateService,
		private readonly trackQueryService: TrackQueryService,
		private readonly audioFileDraftService: AudioFileDraftService,
		private readonly trackLanguageDraftService: TrackLanguageDraftService,
	) {}

	async create(data: CreateTrackDraftDto): Promise<ITrackDraft> {
		const { releaseId, primaryGenreId, subGenreId, audioFileDraft } = data;

		await this.trackValidateService.validate({
			releaseId,
			primaryGenreId,
			subGenreId,
		});

		const track = this.trackRepo.create(data);
		const result = await this.trackRepo.save(track);

		// create audioFile
		if (audioFileDraft) {
			await this.audioFileDraftService.create({
				...audioFileDraft,
				trackId: track.id,
			});
		}

		// create trackLanguage
		await this.trackLanguageDraftService.create({
			trackId: track.id,
		});

		return this.trackValidateService.ensureDraftTrack(result);
	}

	async bulkCreate(data: BulkCreateTrackDraft): Promise<ITrackDraft[]> {
		const result = [];
		for (const track of data.trackDrafts) {
			const newTrackDraft = await this.create(track);
			result.push(newTrackDraft);
		}
		return result;
	}

	async bulkUpdate(data: BulkUpdateTrackDraft): Promise<ITrackDraft[]> {
		const { trackDrafts } = data;
		for (const track of trackDrafts) {
			await this.trackQueryService.findOne(track.id);
		}

		return await this.trackRepo.save(trackDrafts);
	}

	async update(id: string, data: UpdateTrackDraftDto): Promise<ITrackDraft> {
		const { copyArtistsFromRelease, trackLanguage, ...restOfTrack } = data;

		const {
			// releaseId,
			primaryGenreId,
			subGenreId,
		} = restOfTrack;

		const track = await this.trackQueryService.getDetail(id);

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

		// language
		if (trackLanguage) {
			await this.trackLanguageDraftService.update({
				id: track.trackLanguage.id,
				trackLanguage,
			});
		}

		//
		if (copyArtistsFromRelease) {
			await this.copyArtistFromRelease({
				releaseId: track.releaseId,
				trackId: track.id,
			});
		}

		await this.trackRepo.update(id, restOfTrack);
		const result = await this.trackQueryService.findOne(id);

		return this.trackValidateService.ensureDraftTrack(result);
	}

	async copyArtistFromRelease({
		releaseId,
		trackId,
	}: {
		releaseId: string;
		trackId: string;
	}) {
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			relations: {
				releaseArtists: true,
			},
		});

		if (
			release &&
			release.releaseArtists &&
			release.releaseArtists.length > 0
		) {
			const trackArtistData = release?.releaseArtists?.map(
				(releaseArtist) => ({
					artistId: releaseArtist.artistId,
					artistRoleId: releaseArtist.artistRoleId,
					trackId,
				}),
			);

			const trackArtistEntities =
				this.trackArtistRepo.create(trackArtistData);

			await this.trackArtistRepo.save(trackArtistEntities);
		}
	}
}
