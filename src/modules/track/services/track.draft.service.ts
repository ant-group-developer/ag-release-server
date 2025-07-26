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
import { ICreateTrackDraft, ITrackDraft } from '../interfaces/track.interface';

import { CreateAudioFileDraftDto } from 'src/modules/audio-file/dto/audio-file.draft.dto';
import { AudioFileDraftService } from 'src/modules/audio-file/services/audio-file.draft.service';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackArtistService } from 'src/modules/track-artist/services/track-artist.service';
import { UpdateTrackLanguageDraftDto } from 'src/modules/track-language/dto/track-language.draft.dto';
import { TrackLanguageDraftService } from 'src/modules/track-language/services/track-language.draft.service';
import { TrackReleaseService } from './track-release.service';
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
		private readonly trackReleaseService: TrackReleaseService,
	) {}

	async bulkCreate(data: BulkCreateTrackDraft): Promise<ITrackDraft[]> {
		const { trackDrafts } = data;
		const releaseIdOfTracks = trackDrafts[0].releaseId;

		const release =
			await this.trackReleaseService.getReleaseById(releaseIdOfTracks);

		return await Promise.all(
			trackDrafts.map((track) => {
				const syncedTrackDraft = this.syncTrackWithRelease(
					track,
					release,
				);

				return this.handleCreateOne(syncedTrackDraft);
			}),
		);
	}

	private async handleCreateOne(
		data: ICreateTrackDraft,
	): Promise<ITrackDraft> {
		const { audioFileDraft, trackLanguage, ...trackData } = data;
		const trackDb = await this.createTrackDraft(trackData);

		await this.createSubEntities({
			track: trackDb,
			trackLanguage,
			audioFile: audioFileDraft,
		});

		return this.trackValidateService.ensureDraftTrack(trackDb);
	}

	private async createTrackDraft(data: {
		title: string;
		version?: string | null;
		isrc?: string;
		iswc?: string;
		releaseId: string;
		pLineOwner?: string | null;
		primaryGenreId?: string | null;
		subGenreId?: string | null;
	}) {
		const { releaseId, primaryGenreId, subGenreId } = data;

		await this.trackValidateService.validate({
			releaseId,
			primaryGenreId,
			subGenreId,
		});

		const track = this.trackRepo.create(data);
		return await this.trackRepo.save(track);
	}

	private async createSubEntities({
		track,
		trackLanguage,
		audioFile,
	}: {
		track: Track;
		trackLanguage?: {
			metadataLanguageCountryId?: string | null;
			audioLanguageId?: string | null;
			metadataLanguageId?: string | null;
			recordingCountryId?: string | null;
		};
		audioFile: CreateAudioFileDraftDto;
	}) {
		const { id: trackId } = track;

		await this.audioFileDraftService.create({
			...audioFile,
			trackId,
		});

		await this.trackLanguageDraftService.create({
			trackId,
			...trackLanguage,
		});

		await this.trackArtistService.copyArtistFromReleaseSource2({
			releaseId: track.releaseId,
			trackId: track.id,
		});
	}

	private syncTrackWithRelease(
		track: CreateTrackDraftDto,
		release: Release | null,
	): ICreateTrackDraft {
		return {
			...track,

			pLineOwner: release?.pLineOwner,
			primaryGenreId: release?.primaryGenreId,
			subGenreId: release?.subGenreId,
			version: release?.version,

			trackLanguage: {
				...release?.releaseLanguage,
				recordingCountryId:
					release?.releaseLanguage?.metadataLanguageCountryId,
			},
		};
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
			// file?: {
			// 	fileName: string;
			// };
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
