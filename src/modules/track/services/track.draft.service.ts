import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	BulkCreateTrackDraft,
	BulkUpdateTrackDraft,
	UpdateTrackDraftDto,
	UpdateTrackPolicyDto,
} from '../dto/track.draft.dto';
import { Track } from '../entities/track.entity';
import {
	ICreateTrackDraft,
	IHandleCreateTrackOne,
	ITrackDraft,
} from '../interfaces/track.interface';

import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { AudioFileService } from 'src/modules/audio-file/services/audio-file.service';
import { CopyrightService } from 'src/modules/copyright/services/copyright.service';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtistService } from 'src/modules/track-artist/services/track-artist.service';
import { UpdateTrackLanguageDraftDto } from 'src/modules/track-language/dto/track-language.draft.dto';
import { TrackLanguageDraftService } from 'src/modules/track-language/services/track-language.draft.service';
import { TrackPolicyService } from 'src/modules/track-policy/services/track-policy.service';
import { BulkDeleteTracksDto, QueryGetListTrackDto } from '../dto/track.dto';
import { TrackQueryService } from './track.query.service';

@Injectable()
export class TrackDraftService {
	private readonly logger = new Logger(TrackDraftService.name);

	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		private readonly trackQueryService: TrackQueryService,
		private readonly audioFileService: AudioFileService,
		private readonly trackLanguageDraftService: TrackLanguageDraftService,
		private readonly trackArtistService: TrackArtistService,
		private readonly copyrightService: CopyrightService,
		private readonly trackPolicyService: TrackPolicyService,
	) {}

	// create
	async bulkCreate(data: BulkCreateTrackDraft): Promise<ITrackDraft[]> {
		const { trackDrafts } = data;

		const enrichedTrackDrafts =
			await this.trackQueryService.enrichTrackDraftWithReleaseData({
				trackDrafts,
				releaseId: trackDrafts[0].releaseId,
			});

		return Promise.all(
			enrichedTrackDrafts.map((item) =>
				this.createSingleTrackDraft(item),
			),
		);
	}

	private async createSingleTrackDraft(
		data: IHandleCreateTrackOne,
	): Promise<ITrackDraft> {
		const { audioFileDraft, trackLanguage, ...trackData } = data;
		const trackDb = await this.createTrackDraft(trackData);

		await this.createRelatedTrackEntities({
			track: trackDb,
			trackLanguage,
			audioFile: audioFileDraft,
		});

		return this.trackQueryService.ensureDraftTrack(trackDb);
	}

	private async createTrackDraft(data: ICreateTrackDraft) {
		const { releaseId, primaryGenreId, subGenreId, priceTierId } = data;

		await this.trackQueryService.validateForeignKey({
			releaseId,
			primaryGenreId,
			subGenreId,
			priceTierId,
		});

		const track = this.trackRepo.create(data);
		return await this.trackRepo.save(track);
	}

	private async createRelatedTrackEntities({
		track,
		trackLanguage,
		audioFile,
	}: {
		track: Track;
		trackLanguage?: IHandleCreateTrackOne['trackLanguage'];
		audioFile: IHandleCreateTrackOne['audioFileDraft'];
	}) {
		const { id: trackId } = track;

		await this.audioFileService.create({
			...audioFile,
			trackId,
		});

		await this.trackLanguageDraftService.create({
			trackId,
			...trackLanguage,
		});

		await this.trackArtistService.copyArtistFromReleaseSource2({
			releaseId: track.releaseId,
			trackId,
		});

		await this.trackPolicyService.createTrackPoliciesOfTrack({ trackId });
	}

	// read
	async getTrackPolicies({ trackId }: { trackId: string }) {
		return await this.trackPolicyService.getListOfTrack({ trackId });
	}

	async getListWithPolicy(query: QueryGetListTrackDto) {
		const { page, pageSize } = query;

		const [tracksDb, totalItems] =
			await this.trackQueryService.getListWithPolicy(query);

		return new PageDto({
			items: tracksDb,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async createTrackPolicies() {
		const tracksDb = await this.trackRepo.find({
			relations: ['trackPolicies'],
		});

		const trackIdsMissingPolicies = tracksDb
			.filter(
				(track) =>
					!track.trackPolicies || track.trackPolicies.length === 0,
			)
			.map((track) => track.id);
		if (trackIdsMissingPolicies.length > 0) {
			await this.trackPolicyService.createTrackPoliciesForMultipleTracks(
				trackIdsMissingPolicies,
			);
		}
	}

	// update
	async bulkUpdate(data: BulkUpdateTrackDraft): Promise<ITrackDraft[]> {
		const { trackDrafts } = data;

		await Promise.all(
			trackDrafts.map((track) =>
				this.trackQueryService.findOne(track.id),
			),
		);

		return await this.trackRepo.save(trackDrafts);
	}

	async update(id: string, data: UpdateTrackDraftDto): Promise<ITrackDraft> {
		const { audioFile, trackLanguage, ...restOfTrack } = data;

		const track = await this.trackQueryService.getDetailOne(id);

		await this.trackQueryService.validateDataUpdate({
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

		return this.trackQueryService.ensureDraftTrack(result);
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
			preview?: number | null;
			sampleLength?: number | null;
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
				await this.audioFileService.update({
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

	async updateTrackPolicy({
		trackPolicyId,
		data,
	}: {
		trackPolicyId: string;
		data: UpdateTrackPolicyDto;
	}) {
		return await this.trackPolicyService.update({ trackPolicyId, data });
	}

	//delete
	async bulkDelete(data: BulkDeleteTracksDto) {
		const { ids } = data;

		const messageWarnings = await Promise.all(
			ids.map((id) => this.handleDelete(id)),
		);

		return new ResponseSuccess({
			messageWarning: messageWarnings.join('\n'),
		});
	}

	async handleDelete(id: string) {
		await this.deleteRelatedRecords({ trackId: id });
		await this.trackRepo.delete(id);
	}

	private async deleteRelatedRecords({ trackId }: { trackId: string }) {
		await Promise.all([
			this.audioFileService.deleteRecordOfTrackSafe({ trackId }),
			this.trackArtistService.deleteRecordOfTrack({ trackId }),
			this.trackLanguageDraftService.deleteRecordOfTrack({
				trackId,
			}),
			this.copyrightService.deleteResultOfTrack({ trackId }),
			this.trackPolicyService.deleteRecordOrTrack({ trackId }),
		]);
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const tracks = await this.trackQueryService.getTracksOfRelease({
			releaseId,
		});

		await Promise.all(tracks.map((track) => this.handleDelete(track.id)));
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

	async deleteTrackArtistByReleaseArtist(releaseArtistId: string) {
		await this.trackArtistService.deleteByReleaseArtist(releaseArtistId);
	}
}
