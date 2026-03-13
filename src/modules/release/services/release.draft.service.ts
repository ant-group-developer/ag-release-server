import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { ReleaseArtistService } from 'src/modules/release-artist/services/release-artist.service';
import { CreateReleaseCoverArtDto } from 'src/modules/release-cover-art/dto/release-cover-art.dto';
import { ReleaseCoverArtSize } from 'src/modules/release-cover-art/enum/release-cover-art.enum';
import { ReleaseCoverArtService } from 'src/modules/release-cover-art/services/release-cover-art.service';
import { UpdateReleaseLanguageDraftDto } from 'src/modules/release-language/dto/release-language.draft.dto';
import { ReleaseLanguageDraftService } from 'src/modules/release-language/services/release-language.draft.service';
import { UpdateReleaseTerritoryDto } from 'src/modules/release-territory/dto/release-territory.dto';
import { ReleaseTerritoryService } from 'src/modules/release-territory/services/release-territory.service';
import { TrackSensitive } from 'src/modules/track-sensitive/entities/track-sensitive.entity';
import { TrackType } from 'src/modules/track-type/entities/track-type.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { TrackDraftService } from 'src/modules/track/services/track.draft.service';
import { getCoverArtThumbnails } from 'src/utils/util';
import { newTransaction } from 'src/utils/utils.transaction';
import { DataSource, Repository } from 'typeorm';
import { ImportOneReleaseDto, LookupMaps } from '../dto/release-sftp.dto';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus, ReleaseTimeMode } from '../enum/release.enum';
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
	// coverArt
	async autoFillCoverArts(id: string) {
		return await this.releaseCoverArtService.autoFillCoverArts({
			releaseId: id,
		});
	}

	async getErrorsSchemaReleaseById(id: string) {
		const release = await this.releaseQueryService.findOneWithRelation(id);
		return this.releaseValidateService.getErrorsSchemaRelease(release);
	}

	async getErrorsSchemaReleases(releases: any) {
		const maps = await this.buildLookupMaps();

		const success: string[] = [];
		const failed: { id: string; errors: string }[] = [];

		for (const r of releases) {
			const errors: string[] = [];

			if (r.albumFormat && !maps.albumFormat.has(r.albumFormat))
				errors.push(`Không tồn tại loại album: ${r.albumFormat}`);

			if (r.primaryGenre && !maps.genre.has(r.primaryGenre))
				errors.push(`Không tồn tại thể loại: ${r.primaryGenre}`);

			if (r.subGenre && !maps.genre.has(r.subGenre))
				errors.push(`Không tồn tại sub thể loại: ${r.subGenre}`);

			if (r.label && !maps.label.has(r.label))
				errors.push(`Không tồn tại label: ${r.label}`);

			if (
				r.thumbnail &&
				(r.thumbnail.width < 3000 || r.thumbnail.height < 3000)
			)
				errors.push(
					`Ảnh bìa phải tối thiểu 3000x3000, hiện tại: ${r.thumbnail.width}x${r.thumbnail.height}`,
				);

			if (errors.length === 0) success.push(r.id);
			else failed.push({ id: r.id, errors: errors.join(', ') });
		}

		return { success, failed };
	}

	// sftp
	async importOneRelease(payload: ImportOneReleaseDto, maps?: LookupMaps) {
		// console.log(JSON.stringify(payload, null, 2));
		const m = maps ?? (await this.buildLookupMaps());

		const albumFormatId = m.albumFormat.get(payload.albumFormat ?? '');
		const primaryGenreId = m.genre.get(payload.primaryGenre ?? '');
		const subGenreId = m.genre.get(payload.subGenre ?? '');
		const labelId = m.label.get(payload.label ?? '');

		const errors: string[] = [];

		if (!albumFormatId)
			errors.push(`albumFormat không hợp lệ: "${payload.albumFormat}"`);

		if (payload.primaryGenre && !primaryGenreId)
			errors.push(
				`primaryGenre không tồn tại: "${payload.primaryGenre}"`,
			);

		if (payload.subGenre && !subGenreId)
			errors.push(`subGenre không tồn tại: "${payload.subGenre}"`);

		if (payload.label && !labelId)
			errors.push(`label không tồn tại: "${payload.label}"`);

		if (errors.length) throw new Error(errors.join(' | '));

		const DEFAULT_TENANT_ID = '9f0c7eda-dca7-4f65-b787-6a21e6717c59';

		const queryRunner = await newTransaction(this.releaseRepo);

		try {
			const { manager } = queryRunner;

			await manager.getRepository(Release).insert({
				id: payload.id,
				upc: payload.upc ?? null,
				title: payload.title ?? '',
				version: payload.version ?? null,
				status: ReleaseStatus.PROCESSING,
				catalogId: payload.catalogId ?? null,
				isVariousArtist: payload.isVariousArtist ?? false,
				releaseTimeMode:
					(payload.releaseTimeMode as ReleaseTimeMode) ??
					ReleaseTimeMode.GLOBAL_MIDNIGHT,
				releaseTimezoneId: payload.releaseTimezoneId ?? null,
				// releaseDate: payload.releaseDate ?? null,
				// releaseTime: payload.releaseTime ?? null,
				cLineYear: payload.cLineYear ?? null,
				cLineOwner: payload.cLineOwner ?? null,
				pLineYear: payload.pLineYear ?? null,
				pLineOwner: payload.pLineOwner ?? null,
				albumFormatId,
				primaryGenreId: primaryGenreId ?? null,
				subGenreId: subGenreId ?? null,
				labelId: labelId ?? null,
				tenantId: payload.tenantId ?? DEFAULT_TENANT_ID,
			});

			if (payload.thumbnailId) {
				await this.releaseCoverArtService.bulkCreate({
					data: [
						{
							releaseId: payload.id,
							fileId: payload.thumbnailId,
							width: 3000,
							height: 3000,
							type: ReleaseCoverArtSize.ORIGINAL,
						},
					],
					manager,
				});

				await this.releaseCoverArtService.autoFillCoverArts({
					releaseId: payload.id,
					manager,
				});
			}

			for (const track of payload.tracks ?? []) {
				const trackPrimaryGenreId = m.genre.get(
					track.primaryGenre ?? '',
				);
				const trackSubGenreId = m.genre.get(track.subGenre ?? '');
				const trackTypeId = m.trackType.get(track.trackType ?? '');
				const trackSensitiveId = m.trackSensitive.get(
					track.trackSensitive ?? '',
				);
				const priceTierId = m.priceTier.get(track.priceTier ?? '');

				await manager.getRepository(Track).insert({
					id: track.id,
					releaseId: payload.id,
					title: track.title ?? '',
					order: track.order,
					pLineYear: track.pLineYear ?? null,
					pLineOwner: track.pLineOwner ?? null,
					lyric: track.lyric ?? '',
					isByAi: track.isByAi === 'y',
					primaryGenreId: trackPrimaryGenreId ?? null,
					subGenreId: trackSubGenreId ?? null,
					trackTypeId: trackTypeId ?? null,
					trackSensitiveId: trackSensitiveId ?? null,
					priceTierId: priceTierId ?? null,
				});

				if (track.audioFile) {
					await manager.getRepository(AudioFile).insert({
						fileId: track.audioFile.fileId,
						peakId: track.audioFile.peakFileId,
						sampleRate: track.audioFile.sampleRate ?? null,
						bitrate: track.audioFile.bitrate ?? null,
						bitDepth: track.audioFile.bitDepth ?? null,
						duration: track.audioFile.duration ?? null,
						sampleLength: track.audioFile.sampleLength ?? null,
						preview: track.audioFile.preview ?? null,
						trackId: track.id,
					});
				}
			}

			await queryRunner.commitTransaction();

			return {
				success: true,
				releaseId: payload.id,
			};
		} catch (e) {
			await queryRunner.rollbackTransaction();
			throw e;
		} finally {
			await queryRunner.release();
		}
	}

	async importReleases(payloads: ImportOneReleaseDto[]) {
		console.log(JSON.stringify(payloads));

		const maps = await this.buildLookupMaps();

		const results = await Promise.allSettled(
			payloads.map((p) => this.importOneRelease(p, maps)),
		);

		const failed = results
			.map((r, i) => ({ r, i }))
			.filter(({ r }) => r.status === 'rejected')
			.map(({ r, i }) => ({
				releaseId: payloads[i].id,
				error: (r as PromiseRejectedResult).reason?.message,
			}));

		const result = {
			total: payloads.length,
			success: results.filter((r) => r.status === 'fulfilled').length,
			failed: failed.length,
			errors: failed,
			ids: results.map((r) =>
				r.status === 'fulfilled' ? r.value.releaseId : null,
			),
		};
		console.log(result);
	}

	async buildLookupMaps(): Promise<LookupMaps> {
		const albumFormatRepo = this.dataSource.getRepository(AlbumFormat);
		const genreRepo = this.dataSource.getRepository(Genre);
		const labelRepo = this.dataSource.getRepository(Label);
		const trackTypeRepo = this.dataSource.getRepository(TrackType);
		const trackSensitiveRepo =
			this.dataSource.getRepository(TrackSensitive);
		const priceTierRepo = this.dataSource.getRepository(PriceTier);

		const [
			albumFormats,
			genres,
			labels,
			trackTypes,
			trackSensitives,
			priceTiers,
		] = await Promise.all([
			albumFormatRepo.find(),
			genreRepo.find(),
			labelRepo.find(),
			trackTypeRepo.find(),
			trackSensitiveRepo.find(),
			priceTierRepo.find(),
		]);

		return {
			albumFormat: new Map(albumFormats.map((r) => [r.name, r.id])),
			genre: new Map(genres.map((r) => [r.name, r.id])),
			label: new Map(labels.map((r) => [r.name, r.id])),
			trackType: new Map(trackTypes.map((r) => [r.name, r.id])),
			trackSensitive: new Map(trackSensitives.map((r) => [r.name, r.id])),
			priceTier: new Map(
				priceTiers.flatMap((r) =>
					r.code ? [[r.code, r.id] as const] : [],
				),
			),
		};
	}
}
