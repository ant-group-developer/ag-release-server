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
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
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
			track,
			audioFile: audioFileDraft,
		});

		return this.trackValidateService.ensureDraftTrack(trackDb);
	}

	private async createSubEntities({
		track,
		audioFile,
	}: {
		track: Track;
		audioFile: CreateAudioFileDraftDto;
	}) {
		const trackId = track.id;

		await this.audioFileDraftService.create({
			...audioFile,
			trackId,
		});

		await this.trackLanguageDraftService.create({
			trackId,
		});

		await this.trackArtistService.copyArtistFromReleaseSource2({
			releaseId: track.releaseId,
			trackId: track.id,
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
		const { audioFile, trackLanguage, ...restOfTrack } = data;

		const track = await this.trackQueryService.getDetail(id);

		await this.trackValidateService.handleValidateDataUpdate({
			trackDb: track,
			dataUpdate: data,
		});

		await this.updateSubEntities({
			track,
			copyArtistsFromRelease: data.copyArtistsFromRelease,
			audioFile,
			trackLanguage,
		});

		await this.trackRepo.update(id, restOfTrack);
		const result = await this.trackQueryService.getDetail(id);

		return this.trackValidateService.ensureDraftTrack(result);
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
		if (copyArtistsFromRelease !== undefined) {
			if (
				copyArtistsFromRelease === true &&
				copyArtistsFromRelease !== track.copyArtistsFromRelease
			) {
				await this.trackArtistService.copyArtistFromReleaseSource1({
					releaseId: track.releaseId,
					trackId: track.id,
				});
			}

			if (
				copyArtistsFromRelease === false &&
				copyArtistsFromRelease !== track.copyArtistsFromRelease
			) {
				await this.trackArtistService.deleteArtistSource1(track.id);
			}
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

	// artist
	async addArtistToTracksSource1(releaseArtist: ReleaseArtist) {
		const { releaseId } = releaseArtist;

		const tracksTurnOnCopy = await this.trackRepo.find({
			where: {
				releaseId,
				copyArtistsFromRelease: true,
			},
		});

		await this.trackArtistService.addArtistToTracksSource1(
			releaseArtist,
			tracksTurnOnCopy,
		);
	}

	async addArtistToTracks2(releaseArtist: ReleaseArtist) {
		const { releaseId } = releaseArtist;

		const tracksOfRelease = await this.trackRepo.find({
			where: {
				releaseId,
			},
		});

		await this.trackArtistService.addArtistToTracks2(
			releaseArtist,
			tracksOfRelease,
		);
	}

	async deleteArtistTracks2(releaseArtist: ReleaseArtist) {
		await this.trackArtistService.deleteArtistTracks2(releaseArtist);
	}

	// update, delete cascade
	async updateByReleaseArtist(releaseArtist: ReleaseArtist) {
		await this.trackArtistService.updateByReleaseArtist(releaseArtist);
	}

	async deleteByReleaseArtist(releaseArtistId: string) {
		await this.trackArtistService.deleteByReleaseArtist(releaseArtistId);
	}
}
