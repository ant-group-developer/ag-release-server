import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	BulkCreateTrackDraft,
	BulkUpdateTrackDraft,
	UpdateTrackDraftDto,
} from '../dto/track.draft.dto';
import { Track } from '../entities/track.entity';
import {
	ICreateTrackDraft,
	IHandleCreateTrackOne,
	ITrackDraft,
} from '../interfaces/track.interface';

import { AudioFileDraftService } from 'src/modules/audio-file/services/audio-file.draft.service';
import { CopyrightService } from 'src/modules/copyright/services/copyright.service';
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
	private readonly logger = new Logger(TrackDraftService.name);

	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		private readonly trackValidateService: TrackValidateService,
		private readonly trackQueryService: TrackQueryService,
		private readonly audioFileDraftService: AudioFileDraftService,
		private readonly trackLanguageDraftService: TrackLanguageDraftService,
		private readonly trackArtistService: TrackArtistService,
		private readonly trackReleaseService: TrackReleaseService,
		private readonly copyrightService: CopyrightService,
	) {}

	// create
	async bulkCreate(data: BulkCreateTrackDraft): Promise<ITrackDraft[]> {
		const { trackDrafts } = data;
		const releaseIdOfTracks = trackDrafts[0].releaseId;

		const releaseOfTracks =
			await this.trackReleaseService.getReleaseById(releaseIdOfTracks);

		return await Promise.all(
			trackDrafts.map((track) => {
				const trackDraft = this.buildTrackFromRelease({
					track,
					releaseOfTracks,
				});

				return this.handleCreateOne(trackDraft);
			}),
		);
	}

	private buildTrackFromRelease({
		track,
		releaseOfTracks,
	}: {
		track: BulkCreateTrackDraft['trackDrafts'][number];
		releaseOfTracks: Release | null;
	}): IHandleCreateTrackOne {
		const trackLanguage = releaseOfTracks?.releaseLanguage
			? (({ id: _id, ...restOfReleaseLanguage }) => {
					return {
						...restOfReleaseLanguage,
						recordingCountryId:
							restOfReleaseLanguage.metadataLanguageCountryId,
					};
				})(releaseOfTracks.releaseLanguage)
			: undefined;

		return {
			...track,

			pLineYear: releaseOfTracks?.pLineYear,
			pLineOwner: releaseOfTracks?.pLineOwner,

			primaryGenreId: releaseOfTracks?.primaryGenreId,
			subGenreId: releaseOfTracks?.subGenreId,
			version: releaseOfTracks?.version,

			trackLanguage,
		};
	}

	private async handleCreateOne(
		data: IHandleCreateTrackOne,
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

	private async createTrackDraft(data: ICreateTrackDraft) {
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
		trackLanguage?: IHandleCreateTrackOne['trackLanguage'];
		audioFile: IHandleCreateTrackOne['audioFileDraft'];
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

		const track = await this.trackQueryService.getDetailOne(id);

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
		const result = await this.trackQueryService.getDetailOne(id);

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
			if (track.audioFile) {
				await this.audioFileDraftService.update({
					audioFileId: track.audioFile.id,
					dataUpdate: audioFile,
				});
			}
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
	async handleDelete(id: string) {
		await this.deleteRelatedRecords({ trackId: id });
		await this.trackRepo.delete(id);
	}

	private async deleteRelatedRecords({ trackId }: { trackId: string }) {
		await Promise.all([
			this.audioFileDraftService.deleteRecordOfTrack({ trackId }),
			this.trackArtistService.deleteRecordOfTrack({ trackId }),
			this.trackLanguageDraftService.deleteRecordOfTrack({
				trackId,
			}),
			this.copyrightService.deleteResultOfTrack({ trackId }),
		]);
	}

	// safe
	async deleteRecordOfReleaseSafe({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const tracks = await this.trackQueryService.getTracksOfRelease({
			releaseId,
		});

		await Promise.all(
			tracks.map((track) => this.handleDeleteSafe(track.id)),
		);
	}

	async handleDeleteSafe(id: string) {
		await this.deleteRelatedRecordsSafe({ trackId: id });
		await this.trackRepo
			.delete(id)
			.catch((e) =>
				this.logger.warn(`Skip delete, reason: ${e.message}`),
			);
	}

	private async deleteRelatedRecordsSafe({ trackId }: { trackId: string }) {
		await Promise.all([
			this.audioFileDraftService.deleteRecordOfTrackSafe({ trackId }),
			this.trackArtistService.deleteRecordOfTrackSafe({ trackId }),
			this.trackLanguageDraftService.deleteRecordOfTrackSafe({
				trackId,
			}),
			this.copyrightService.deleteResultOfTrackSafe({ trackId }),
		]);
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

	async deleteTrackArtistByReleaseArtistSafe(releaseArtistId: string) {
		await this.trackArtistService.deleteByReleaseArtistSafe(
			releaseArtistId,
		);
	}
}
