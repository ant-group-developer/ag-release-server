import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	BulkCreateTrackDraft,
	BulkUpdateTrackDraft,
	CreateTrackDraftDto,
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
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { TrackArtistService } from 'src/modules/track-artist/services/track-artist.service';
import { TrackContributorService } from 'src/modules/track-contributor/services/track-contributor.service';
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
		private readonly trackContributorService: TrackContributorService,
		private readonly copyrightService: CopyrightService,
		private readonly trackPolicyService: TrackPolicyService,
	) {}

	// create
	async bulkCreate(data: BulkCreateTrackDraft): Promise<ITrackDraft[]> {
		const { trackDrafts } = data;

		await this.generateTrackDraftOrders(trackDrafts);

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

	private async generateTrackDraftOrders(
		trackDrafts: CreateTrackDraftDto[],
	): Promise<CreateTrackDraftDto[]> {
		if (!trackDrafts.length) {
			return trackDrafts;
		}

		const releaseId = trackDrafts[0].releaseId;

		const raw = await this.trackRepo
			.createQueryBuilder('track')
			.select('COALESCE(MAX(track.order), 0)', 'maxOrder')
			.where('track.releaseId = :releaseId', { releaseId })
			.getRawOne<{ maxOrder: string }>();

		const maxOrder = Number(raw?.maxOrder ?? 0);

		let nextOrder = maxOrder + 1;

		trackDrafts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

		for (const trackDraft of trackDrafts) {
			trackDraft.order = nextOrder++;
		}

		return trackDrafts;
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
				page,
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
	async bulkUpdate(data: BulkUpdateTrackDraft) {
		const trackDrafts = data.trackDrafts.filter((t) => t.id);

		if (!this.shouldUpdateTrackDraftsIndividually(trackDrafts)) {
			await this.trackRepo.manager.transaction(async (manager) => {
				const repo = manager.getRepository(Track);

				await repo.save(
					trackDrafts.map((trackDraft, index) => ({
						id: trackDraft.id,
						order: -(index + 1),
					})),
				);

				await repo.save(
					trackDrafts.map((trackDraft) => ({
						id: trackDraft.id,
						order: trackDraft.order,
					})),
				);
			});
			return;
		}

		for (const t of trackDrafts) {
			if (t.id) {
				// this.updateSafe(t.id, t);
				await this.update(t.id, t);
			}
		}
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

	private shouldUpdateTrackDraftsIndividually(
		trackDrafts: UpdateTrackDraftDto[],
	) {
		return trackDrafts.some((trackDraft) => {
			if (trackDraft.order === undefined) {
				return true;
			}

			const updateKeys = Object.keys(trackDraft).filter(
				(key) =>
					trackDraft[key as keyof UpdateTrackDraftDto] !== undefined,
			);

			return updateKeys.some((key) => !['id', 'order'].includes(key));
		});
	}

	updateSafe(id: string, data: UpdateTrackDraftDto) {
		this.update(id, data).catch((err) => console.log(err));
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

	async updateTracksOfRelease({
		releaseId,
		data,
	}: {
		releaseId: string;
		data: UpdateTrackDraftDto;
	}) {
		const tracks = await this.trackQueryService.getTracksOfRelease({
			releaseId,
		});

		await Promise.all(
			tracks.map((track) => this.updateSafe(track.id, data)),
		);
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
	async syncTrackContributorsFromReleaseArtist(releaseArtist: ReleaseArtist) {
		const { releaseId } = releaseArtist;

		const tracksTurnOnCopy = await this.trackRepo.find({
			where: {
				releaseId,
				copyArtistsFromRelease: true,
			},
		});

		await this.trackArtistService.syncTrackContributorsFromReleaseArtist(
			releaseArtist,
			tracksTurnOnCopy,
		);
	}

	async syncTrackContributorsFromReleaseContributor(
		releaseContributor: ReleaseContributor,
	) {
		const { releaseId } = releaseContributor;

		const tracksTurnOnCopy = await this.trackRepo.find({
			where: {
				releaseId,
				copyContributorsFromRelease: true,
			},
		});

		await this.trackContributorService.syncTrackContributorsFromReleaseContributor(
			releaseContributor,
			tracksTurnOnCopy,
		);
	}

	async addArtistToTracks(releaseArtist: ReleaseArtist) {
		const { releaseId } = releaseArtist;

		const tracksOfRelease = await this.trackRepo.find({
			where: {
				releaseId,
			},
		});

		await this.trackArtistService.addArtistToTracks(
			releaseArtist,
			tracksOfRelease,
		);
	}

	async addContributorToTracks(releaseContributor: ReleaseContributor) {
		const { releaseId } = releaseContributor;

		const tracksOfRelease = await this.trackRepo.find({
			where: {
				releaseId,
			},
		});

		await this.trackContributorService.addContributorToTracks(
			releaseContributor,
			tracksOfRelease,
		);
	}

	async deleteTrackArtists(releaseArtist: ReleaseArtist) {
		await this.trackArtistService.deleteTrackArtists(releaseArtist);
	}

	async deleteTrackContributor(releaseContributor: ReleaseContributor) {
		await this.trackContributorService.deleteTrackContributors(
			releaseContributor,
		);
	}

	// update, delete cascade
	async updateTrackArtist(releaseArtist: ReleaseArtist) {
		await this.trackArtistService.updateTrackArtist(releaseArtist);
	}

	async updateTrackContributor(releaseContributor: ReleaseContributor) {
		await this.trackContributorService.updateTrackContributor(
			releaseContributor,
		);
	}

	async deleteTrackArtistByReleaseArtist(releaseArtistId: string) {
		await this.trackArtistService.deleteByReleaseArtist(releaseArtistId);
	}

	async deleteTrackContributorByReleaseContributor(
		releaseContributorId: string,
	) {
		await this.trackContributorService.deleteByReleaseContributor(
			releaseContributorId,
		);
	}

	// private
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

		await this.trackArtistService.copyContributorFromReleaseSource2({
			releaseId: track.releaseId,
			trackId,
		});

		await this.trackPolicyService.createTrackPoliciesOfTrack({ trackId });
	}

	private async deleteRelatedRecords({ trackId }: { trackId: string }) {
		await Promise.all([
			this.audioFileService.deleteRecordOfTrackSafe({ trackId }),
			this.trackArtistService.deleteRecordOfTrack({ trackId }),
			this.trackContributorService.deleteRecordOfTrack({ trackId }),
			this.trackLanguageDraftService.deleteRecordOfTrack({
				trackId,
			}),
			this.copyrightService.deleteResultOfTrack({ trackId }),
			this.trackPolicyService.deleteRecordOrTrack({ trackId }),
		]);
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
}
