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

import { CreateAudioFileDraftDto } from 'src/modules/audio-file/dto/audio-file.draft.dto';
import { AudioFileDraftService } from 'src/modules/audio-file/services/audio-file.draft.service';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackArtistService } from 'src/modules/track-artist/services/track-artist.service';
import { UpdateTrackLanguageDraftDto } from 'src/modules/track-language/dto/track-language.draft.dto';
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
		private readonly trackArtistService: TrackArtistService,
	) {}

	async create(data: CreateTrackDraftDto): Promise<ITrackDraft> {
		const { audioFileDraft, ...restOfData } = data;
		const { releaseId, primaryGenreId, subGenreId } = restOfData;

		await this.trackValidateService.validate({
			releaseId,
			primaryGenreId,
			subGenreId,
		});

		const track = this.trackRepo.create(data);
		const trackDb = await this.trackRepo.save(track);

		await this.createSubEntities({
			trackId: track.id,
			audioFile: audioFileDraft,
		});

		return this.trackValidateService.ensureDraftTrack(trackDb);
	}

	private async createSubEntities({
		trackId,
		audioFile,
	}: {
		trackId: string;
		audioFile: CreateAudioFileDraftDto;
	}) {
		await this.audioFileDraftService.create({
			...audioFile,
			trackId,
		});

		await this.trackLanguageDraftService.create({
			trackId,
		});
	}

	async bulkCreate(data: BulkCreateTrackDraft): Promise<ITrackDraft[]> {
		const result = [];
		for (const track of data.trackDrafts) {
			const newTrackDraft = await this.create(track);
			result.push(newTrackDraft);
		}
		return result;
	}

	// update
	async bulkUpdate(data: BulkUpdateTrackDraft): Promise<ITrackDraft[]> {
		const { trackDrafts } = data;
		for (const track of trackDrafts) {
			await this.trackQueryService.findOne(track.id);
		}

		return await this.trackRepo.save(trackDrafts);
	}

	async update(id: string, data: UpdateTrackDraftDto): Promise<ITrackDraft> {
		const {
			copyArtistsFromRelease,
			audioFile,
			trackLanguage,
			...restOfTrack
		} = data;

		const track = await this.trackQueryService.getDetail(id);

		await this.handleValidateDataUpdate({
			trackDb: track,
			dataUpdate: data,
		});

		await this.updateSubEntities({
			track,
			copyArtistsFromRelease,
			audioFile,
			trackLanguage,
		});

		await this.trackRepo.update(id, restOfTrack);
		const result = await this.trackQueryService.getDetail(id);

		return this.trackValidateService.ensureDraftTrack(result);
	}

	private async handleValidateDataUpdate({
		trackDb,
		dataUpdate,
	}: {
		trackDb: Track;
		dataUpdate: UpdateTrackDraftDto;
	}) {
		const { primaryGenreId, subGenreId, trackOriginTypeId, trackTypeId } =
			dataUpdate;

		if (primaryGenreId && primaryGenreId !== trackDb.primaryGenreId) {
			await this.trackValidateService.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== trackDb.subGenreId) {
			await this.trackValidateService.validate({
				subGenreId,
			});
		}

		if (
			trackOriginTypeId &&
			trackOriginTypeId !== trackDb.trackOriginTypeId
		) {
			await this.trackValidateService.validate({
				trackOriginTypeId,
			});
		}

		if (trackTypeId && trackTypeId !== trackDb.trackTypeId) {
			await this.trackValidateService.validate({
				trackTypeId,
			});
		}
	}

	private async updateSubEntities({
		track,
		trackLanguage,
		audioFile,
		copyArtistsFromRelease,
	}: {
		track: Track;
		trackLanguage?: UpdateTrackLanguageDraftDto;
		audioFile?: {
			preview?: number;
			file?: {
				fileName: string;
			};
		};
		copyArtistsFromRelease?: boolean;
	}) {
		if (trackLanguage) {
			if (track.trackLanguage?.id) {
				await this.trackLanguageDraftService.update({
					id: track.trackLanguage.id,
					dataUpdate: trackLanguage,
				});
			} else {
				await this.trackLanguageDraftService.create({
					...trackLanguage,
					trackId: track.id,
				});
			}
		}

		if (audioFile) {
			await this.audioFileDraftService.update({
				audioFileId: track.audioFile.id,
				dataUpdate: audioFile,
			});
		}

		//
		if (copyArtistsFromRelease) {
			await this.copyArtistFromRelease({
				releaseId: track.releaseId,
				trackId: track.id,
			});
		}
	}

	private async copyArtistFromRelease({
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

	//delete
	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const tracks = await this.trackQueryService.getTracksOfRelease({
			releaseId,
		});

		for (const track of tracks) {
			await this.mainDelete(track.id);
		}
	}

	async mainDelete(id: string) {
		await this.deleteRelatedRecords({ trackId: id });
		await this.trackRepo.delete(id);
	}

	private async deleteRelatedRecords({ trackId }: { trackId: string }) {
		await this.audioFileDraftService.deleteRecordOfTrack({ trackId });
		await this.trackArtistService.deleteRecordOfTrack({ trackId });
		await this.trackLanguageDraftService.deleteRecordOfTrack({ trackId });
	}
}
