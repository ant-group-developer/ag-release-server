import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { ReleaseArtistService } from 'src/modules/release-artist/services/release-artist.service';
import { CreateReleaseCoverArtDto } from 'src/modules/release-cover-art/dto/release-cover-art.dto';
import { ReleaseCoverArtService } from 'src/modules/release-cover-art/services/release-cover-art.service';
import { UpdateReleaseLanguageDraftDto } from 'src/modules/release-language/dto/release-language.draft.dto';
import { ReleaseLanguageDraftService } from 'src/modules/release-language/services/release-language.draft.service';
import { UpdateReleaseTerritoryDto } from 'src/modules/release-territory/dto/release-territory.dto';
import { ReleaseTerritoryService } from 'src/modules/release-territory/services/release-territory.service';
import { Track } from 'src/modules/track/entities/track.entity';
import { TrackDraftService } from 'src/modules/track/services/track.draft.service';
import { getCoverArtThumbnails } from 'src/utils/util';
import { DataSource, Repository } from 'typeorm';
import { ImportOneReleaseDto } from '../dto/release-sftp.dto';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseDraftService {
	private readonly logger = new Logger(ReleaseDraftService.name);

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,

		private readonly releaseCoverArtService: ReleaseCoverArtService,
		private readonly releaseLanguageDraftService: ReleaseLanguageDraftService,
		private readonly releaseArtistService: ReleaseArtistService,
		private readonly releaseTerritoryService: ReleaseTerritoryService,

		private readonly trackDraftService: TrackDraftService,
		private readonly dataSource: DataSource,
	) {}

	// create
	async create(
		data: CreateReleaseDraftDto,
		tenantId: string,
		userId: string,
	): Promise<Release> {
		const {
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		} = data;

		await this.releaseValidateService.validate({
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		});

		const release = this.releaseRepo.create({
			...data,
			tenantId,
			creatorId: userId,
			modifierId: userId,
		});
		const releaseDb = await this.releaseRepo.save(release);

		// coverArt
		await this.createSubEntities(releaseDb.id);

		return releaseDb;
	}

	private async createSubEntities(releaseId: string) {
		await this.releaseLanguageDraftService.create({
			releaseId,
		});

		await this.releaseTerritoryService.create({
			releaseId,
		});
	}

	// update
	async update(
		id: string,
		data: UpdateReleaseDraftDto,
		userId: string,
	): Promise<IReleaseDetail> {
		const {
			releaseCoverArt,
			releaseLanguage,
			releaseTerritory,
			...restOfData
		} = data;

		const release = await this.releaseQueryService.findOne(id);

		// if (release.status !== ReleaseStatus.DRAFT) {
		// 	throw new ResponseError({
		// 		message: 'Error release.status',
		// 	});
		// }

		await this.releaseValidateService.handleValidateDataUpdate({
			release,
			dataUpdate: data,
		});

		// subEntities
		await this.updateSubEntities({
			release,
			releaseLanguage,
			releaseCoverArt,
			releaseTerritory,
		});

		await this.releaseRepo.update(id, {
			...restOfData,
			modifierId: userId,
		});
		const releaseDb = await this.releaseQueryService.getOneDetail(id);

		const { releaseCoverArts, ...restOfRelease } = releaseDb;

		const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	private async updateSubEntities({
		release,
		releaseLanguage,
		releaseCoverArt,
		releaseTerritory,
	}: {
		release: Release;
		releaseLanguage?: UpdateReleaseLanguageDraftDto;
		releaseCoverArt?: CreateReleaseCoverArtDto | null;
		releaseTerritory?: UpdateReleaseTerritoryDto;
	}) {
		const releaseId = release.id;

		await this.releaseLanguageDraftService.handleUpdateReleaseLanguage({
			release,
			releaseLanguage,
		});

		await this.releaseTerritoryService.handleUpdateReleaseTerritory({
			release,
			releaseTerritory,
		});

		await this.releaseCoverArtService.handleUpdateReleaseCoverArt({
			releaseId,
			releaseCoverArt,
		});
	}

	// delete
	async deleteDb(id: string) {
		await this.releaseRepo.delete(id);
	}

	async handleDelete(id: string): Promise<void> {
		await this.deleteRelatedRecords({ releaseId: id });
		await this.deleteDb(id);
	}

	private async deleteRelatedRecords({ releaseId }: { releaseId: string }) {
		await Promise.all([
			this.releaseLanguageDraftService.deleteRecordOfRelease({
				releaseId,
			}),

			this.releaseArtistService.deleteRecordOfRelease({
				releaseId,
			}),

			this.releaseCoverArtService.deleteRecordOfRelease({
				releaseId,
			}),

			this.trackDraftService.deleteRecordOfRelease({
				releaseId,
			}),

			this.releaseTerritoryService.deleteRecordOfRelease({
				releaseId,
			}),
		]);
	}

	// other
	async getErrorsSchemaRelease(id: string) {
		const release = await this.releaseQueryService.findOneWithRelation(id);
		return this.releaseValidateService.getErrorsSchemaRelease(release);
	}

	// sftp
	// async importReleases(payloads: any[]) {
	// 	return this.dataSource.transaction(async (manager) => {
	// 		for (const payload of payloads) {
	// 			await manager.getRepository(Release).insert({
	// 				id: payload.id,
	// 				creatorId: payload.creatorId,
	// 				modifierId: payload.modifierId,
	// 				upc: payload.upc,
	// 				albumFormatId: payload.albumFormatId,
	// 				primaryGenreId: payload.primaryGenreId,
	// 				subGenreId: payload.subGenreId,
	// 				labelId: payload.labelId,
	// 				title: payload.title,
	// 				version: payload.version,
	// 				status: payload.status,
	// 				cLineYear: payload.cLineYear,
	// 				cLineOwner: payload.cLineOwner,
	// 				pLineYear: payload.pLineYear,
	// 				pLineOwner: payload.pLineOwner,
	// 				catalogId: payload.catalogId,
	// 				isVariousArtist: payload.isVariousArtist,
	// 				releaseTimeMode: payload.releaseTimeMode,
	// 				releaseTimezoneId: payload.releaseTimezoneId,
	// 				releaseDate: payload.releaseDate,
	// 				releaseTime: payload.releaseTime,
	// 				tenantId: payload.tenantId,
	// 				coverArtThumbnails: payload.coverArtThumbnails ?? null,
	// 			});

	// 			for (const track of payload.tracks ?? []) {
	// 				await manager.getRepository(Track).insert({
	// 					id: track.id,
	// 					title: track.title,
	// 					version: track.version,
	// 					isrc: track.isrc,
	// 					iswc: track.iswc,
	// 					releaseId: payload.id,
	// 					pLineYear: track.pLineYear,
	// 					pLineOwner: track.pLineOwner,
	// 					primaryGenreId: track.primaryGenreId,
	// 					subGenreId: track.subGenreId,
	// 					order: track.order,
	// 					trackTypeId: track.trackTypeId,
	// 					trackOriginTypeId: track.trackOriginTypeId,
	// 					trackSensitiveId: track.trackSensitiveId,
	// 					isByAi: track.isByAi,
	// 					lyric: track.lyric,
	// 					scanCopyrightStatus: track.scanCopyrightStatus,
	// 					copyArtistsFromRelease: track.copyArtistsFromRelease,
	// 					copyContributorsFromRelease:
	// 						track.copyContributorsFromRelease,
	// 					priceTierId: track.priceTierId,
	// 				});

	// 				if (track.audioFile) {
	// 					await manager.getRepository(AudioFile).insert({
	// 						id: track.audioFile.id,
	// 						sampleRate: track.audioFile.sampleRate,
	// 						bitrate: track.audioFile.bitrate,
	// 						bitDepth: track.audioFile.bitDepth,
	// 						duration: track.audioFile.duration,
	// 						sampleLength: track.audioFile.sampleLength,
	// 						preview: track.audioFile.preview,
	// 						trackId: track.id,
	// 						fileId: track.audioFile.fileId,
	// 						peakId: track.audioFile.peakId,
	// 					});
	// 				}

	// 				for (const trackArtist of track.trackArtists ?? []) {
	// 					await manager.getRepository(Artist).insert({
	// 						id: trackArtist.artist.id,
	// 						name: trackArtist.artist.name,
	// 						code: trackArtist.artist.code,
	// 						picture: trackArtist.artist.picture,
	// 						biography: trackArtist.artist.biography,
	// 						artistSource: trackArtist.artist.artistSource,
	// 						idSource: trackArtist.artist.idSource,
	// 						genreId: trackArtist.artist.genreId,
	// 						countryId: trackArtist.artist.countryId,
	// 						spotifyId: trackArtist.artist.spotifyId,
	// 						appleMusicId: trackArtist.artist.appleMusicId,
	// 						primaryGenre: trackArtist.artist.primaryGenre,
	// 						originCountry: trackArtist.artist.originCountry,
	// 						isScanned: trackArtist.artist.isScanned,
	// 					});

	// 					await manager.getRepository(TrackArtist).insert({
	// 						id: trackArtist.id,
	// 						artistId: trackArtist.artistId,
	// 						trackId: track.id,
	// 						releaseArtistId: trackArtist.releaseArtistId,
	// 						isFromReleaseAction:
	// 							trackArtist.isFromReleaseAction,
	// 						isFromTrackAction: trackArtist.isFromTrackAction,
	// 					});
	// 				}

	// 				if (track.trackLanguage) {
	// 					await manager.getRepository(TrackLanguage).insert({
	// 						id: track.trackLanguage.id,
	// 						metadataLanguageCountryId:
	// 							track.trackLanguage.metadataLanguageCountryId,
	// 						audioLanguageId:
	// 							track.trackLanguage.audioLanguageId,
	// 						metadataLanguageId:
	// 							track.trackLanguage.metadataLanguageId,
	// 						trackId: track.id,
	// 						recordingCountryId:
	// 							track.trackLanguage.recordingCountryId,
	// 					});
	// 				}
	// 			}
	// 		}

	// 		return {
	// 			success: true,
	// 			total: payloads.length,
	// 		};
	// 	});
	// }

	async importOneRelease(payload: ImportOneReleaseDto) {
		console.log(payload);
		// return;

		return this.dataSource.transaction(async (manager) => {
			await manager.getRepository(Release).insert({
				id: payload.id,
				upc: payload.upc,
				title: payload.title ?? '',
				version: payload.version ?? null,
				status: ReleaseStatus.PROCESSING,
				catalogId: payload.catalogId ?? undefined,
				isVariousArtist: payload.isVariousArtist,
				// releaseTimeMode,
				// releaseTimezoneId: payload.releaseTimezoneId ?? undefined,
				releaseDate: payload.releaseDate ?? undefined,
				releaseTime: payload.releaseTime ?? undefined,
				cLineYear: payload.cLineYear ?? undefined,
				cLineOwner: payload.cLineOwner ?? undefined,
				pLineYear: payload.pLineYear ?? undefined,
				pLineOwner: payload.pLineOwner ?? undefined,
			});

			for (const track of payload.tracks ?? []) {
				await manager.getRepository(Track).insert({
					id: track.id,
					releaseId: payload.id,
					title: track.title ?? undefined,
					order: track.order,
					pLineYear: track.pLineYear ?? undefined,
					pLineOwner: track.pLineOwner ?? undefined,
					lyric: track.lyric ?? undefined,
					isByAi: track.isByAi === 'y',
				});

				if (track.audioFile) {
					await manager.getRepository(AudioFile).insert({
						fileId: track.audioFile.fileId,
						sampleRate: String(track.audioFile.sampleRate),
						bitrate: track.audioFile.bitrate,
						bitDepth: track.audioFile.bitDepth,
						duration: track.audioFile.duration,
						sampleLength: track.audioFile.sampleLength,
						preview: track.audioFile.preview,
						trackId: track.id,
					});
				}
			}

			return { success: true };
		});
	}

	async importReleases(payloads: ImportOneReleaseDto[]) {
		const results = await Promise.allSettled(
			payloads.map((p) => this.importOneRelease(p)),
		);

		return {
			total: payloads.length,
			success: results.filter((r) => r.status === 'fulfilled').length,
			failed: results.filter((r) => r.status === 'rejected').length,
		};
	}
}
