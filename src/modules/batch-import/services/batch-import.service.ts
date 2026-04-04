import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ReleaseDspDelivery } from 'src/modules/release/modules/release-dsp-delivery/entities/release-dsp-delivery.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseTerritory } from 'src/modules/release-territory/entities/release-territory.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackContributor } from 'src/modules/track-contributor/entities/track-contributor.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackOriginType } from 'src/modules/track-origin-type/entities/track-origin-type.entity';
import { TrackSensitive } from 'src/modules/track-sensitive/entities/track-sensitive.entity';
import { TrackType } from 'src/modules/track-type/entities/track-type.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { newTransaction } from 'src/utils/utils.transaction';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { EXCEL_COLUMNS } from '../constants/excel-columns.constant';
import { CreateReleaseFromExcelDto } from '../dto/batch-import-create.dto';
import {
	GetBatchImportLogsDto,
	LogSkippedReleaseDto,
	UploadCompleteDto,
	ValidateReleaseDto,
} from '../dto/batch-import.dto';
import { BatchImportLog } from '../entities/batch-import-log.entity';
import { BatchImportStatus } from '../enum/batch-import.enum';
import { ExcelLookupMaps, ExcelMapperService } from './excel-mapper.service';

@Injectable()
export class BatchImportService {
	private readonly logger = new Logger(BatchImportService.name);

	constructor(
		@InjectRepository(BatchImportLog)
		private readonly logRepo: Repository<BatchImportLog>,
		private readonly excelMapper: ExcelMapperService,
		private readonly dataSource: DataSource,
	) {}

	async getLogs(params: GetBatchImportLogsDto) {
		const { page = 1, pageSize = 20, batchId, status } = params;

		const qb = this.logRepo.createQueryBuilder('log');

		if (batchId) {
			qb.andWhere('log.batchId = :batchId', { batchId });
		}

		if (status) {
			qb.andWhere('log.status = :status', { status });
		}

		qb.orderBy('log.createdAt', 'DESC');
		qb.skip((page - 1) * pageSize).take(pageSize);

		const [data, total] = await qb.getManyAndCount();

		return { data, total };
	}

	/**
	 * Get the latest status of a specific release for idempotency checks.
	 */
	async getReleaseStatus(
		batchId: string,
		releaseFolder: string,
	): Promise<string | null> {
		const log = await this.logRepo.findOne({
			where: { batchId, releaseFolder },
			order: { createdAt: 'DESC' },
			select: ['status'],
		});

		return log?.status ?? null;
	}

	/**
	 * Get aggregate progress for a batch.
	 */
	async getBatchProgress(batchId: string) {
		const logs = await this.logRepo.find({
			where: { batchId },
			select: ['status'],
		});

		const total = logs.length;
		const completed = logs.filter(
			(l) => l.status === BatchImportStatus.COMPLETED,
		).length;
		const failed = logs.filter(
			(l) =>
				l.status === BatchImportStatus.FAILED ||
				l.status === BatchImportStatus.VALIDATION_FAILED,
		).length;
		const skipped = logs.filter(
			(l) => l.status === BatchImportStatus.SKIPPED,
		).length;
		const inProgress = total - completed - failed - skipped;

		return { batchId, total, completed, failed, skipped, inProgress };
	}

	/**
	 * Log a skipped release (missing or unreadable Excel file).
	 */
	async logSkippedRelease(dto: LogSkippedReleaseDto) {
		const log = this.logRepo.create({
			tenantCode: dto.tenantCode,
			batchId: dto.batchId,
			releaseFolder: dto.releaseFolder,
			status: BatchImportStatus.SKIPPED,
			errors: [dto.reason],
		});

		const saved = await this.logRepo.save(log);

		this.logger.log(
			`Logged skipped release "${dto.releaseFolder}" in batch "${dto.batchId}": ${dto.reason}`,
		);

		return { logId: saved.id };
	}

	async validateRelease(dto: ValidateReleaseDto) {
		const {
			tenantCode,
			batchId,
			releaseFolder,
			excelData,
			audioFileNames,
			thumbnailFileName,
		} = dto;

		const errors: string[] = [];

		// Validate tenant exists
		const tenant = await this.dataSource
			.getRepository(Tenant)
			.findOne({ where: { code: tenantCode } });

		if (!tenant) {
			errors.push(`Tenant not found for code "${tenantCode}"`);
		}

		if (!excelData || excelData.length === 0) {
			errors.push('Excel file is empty or has no data rows');
		}

		if (audioFileNames && excelData && excelData.length > 0) {
			this.validateAudioFileNames(excelData, audioFileNames, errors);
		}

		this.validateThumbnail(releaseFolder, thumbnailFileName, errors);

		const isValid = errors.length === 0;

		const log = this.logRepo.create({
			tenantCode,
			batchId,
			releaseFolder,
			status: isValid
				? BatchImportStatus.VALIDATED
				: BatchImportStatus.VALIDATION_FAILED,
			excelData,
			errors: errors.length > 0 ? errors : null,
		});

		const saved = await this.logRepo.save(log);

		this.logger.log(
			`Release "${releaseFolder}" in batch "${batchId}" — ${isValid ? 'VALID' : 'INVALID (' + errors.length + ' errors)'}`,
		);

		return {
			valid: isValid,
			logId: saved.id,
			errors: isValid ? null : errors,
		};
	}

	async uploadComplete(dto: UploadCompleteDto) {
		const { logId, storageKeys } = dto;

		const log = await this.logRepo.findOneBy({ id: logId });

		if (!log) {
			throw new Error(`Log record not found: ${logId}`);
		}

		log.status = BatchImportStatus.UPLOADED;
		log.storageKeys = storageKeys;

		await this.logRepo.save(log);

		this.logger.log(
			`Upload complete for log "${logId}" — ${storageKeys.length} file(s)`,
		);

		return { success: true };
	}

	/**
	 * Create or update Release + Track entities from Excel data.
	 * If a release with the same UPC already exists, update it.
	 */
	async createReleaseFromExcel(dto: CreateReleaseFromExcelDto) {
		const {
			logId,
			tenantCode,
			batchId,
			releaseFolder,
			excelData,
			storageKeys,
			audioMetadata,
		} = dto;

		const log = await this.logRepo.findOneBy({ id: logId });
		if (!log) {
			throw new Error(`Log record not found: ${logId}`);
		}

		log.status = BatchImportStatus.CREATING;
		await this.logRepo.save(log);

		try {
			// Resolve tenantCode → tenantId
			const tenant = await this.dataSource
				.getRepository(Tenant)
				.findOne({ where: { code: tenantCode } });

			if (!tenant) {
				throw new Error(`Tenant not found for code "${tenantCode}"`);
			}

			const maps = await this.buildLookupMaps();

			const mapped = this.excelMapper.mapExcelToRelease(
				excelData,
				storageKeys,
				maps,
				batchId,
				releaseFolder,
				audioMetadata,
			);

			// return {
			// 	mapped,
			// };

			// Collect all unique artist names
			const allArtistNames = new Set<string>();
			for (const ra of mapped.releaseArtists) {
				allArtistNames.add(ra.artistName);
			}
			for (const rc of mapped.releaseContributors) {
				allArtistNames.add(rc.artistName);
			}
			for (const t of mapped.tracks) {
				for (const ta of t.trackArtists) {
					allArtistNames.add(ta.artistName);
				}
				for (const tc of t.trackContributors) {
					allArtistNames.add(tc.artistName);
				}
			}

			const queryRunner = await newTransaction(this.logRepo);

			try {
				const { manager } = queryRunner;

				const artistIdMap = await this.excelMapper.resolveArtistIds(
					Array.from(allArtistNames),
					maps,
					manager,
				);

				// Check if release with same UPC already exists
				const upc = mapped.release.upc;
				let releaseId: string;
				let isUpdate = false;

				// Set tenantId on the release
				mapped.release.tenantId = tenant.id;

				const existingRelease = upc
					? await manager.findOne(Release, { where: { upc } })
					: null;

				if (existingRelease) {
					isUpdate = true;
					releaseId = existingRelease.id;

					this.logger.log(
						`Release with UPC "${upc}" already exists (id: ${releaseId}). Updating...`,
					);
					this.appendLogError(
						log,
						`[INFO] Existing release found for UPC "${upc}" (id: ${releaseId}). Updating release.`,
					);

					// Delete all old sub-entities
					await this.deleteReleaseSubEntities(manager, releaseId);

					// Update release entity fields
					Object.assign(existingRelease, {
						title: mapped.release.title,
						version: mapped.release.version,
						albumFormatId: mapped.release.albumFormatId,
						primaryGenreId: mapped.release.primaryGenreId,
						labelId: mapped.release.labelId,
						catalogId: mapped.release.catalogId,
						cLineYear: mapped.release.cLineYear,
						cLineOwner: mapped.release.cLineOwner,
						pLineYear: mapped.release.pLineYear,
						pLineOwner: mapped.release.pLineOwner,
						releaseDate: mapped.release.releaseDate,
						releaseTime: mapped.release.releaseTime,
						metadataCi: mapped.release.metadataCi,
					});

					await manager.save(Release, existingRelease);
				} else {
					// Create new release
					const savedRelease = await manager.save(
						Release,
						mapped.release,
					);
					releaseId = savedRelease.id;
				}

				// Save ReleaseTerritory
				mapped.releaseTerritory.releaseId = releaseId;
				await manager.save(ReleaseTerritory, mapped.releaseTerritory);

				// Save ReleaseLanguage
				mapped.releaseLanguage.releaseId = releaseId;
				await manager.save(ReleaseLanguage, mapped.releaseLanguage);

				// Save ReleaseArtists
				for (const ra of mapped.releaseArtists) {
					const artistId = artistIdMap.get(ra.artistName);
					if (!artistId) continue;
					ra.entity.releaseId = releaseId;
					ra.entity.artistId = artistId;
					await manager.save(ReleaseArtist, ra.entity);
				}

				// Save ReleaseContributors
				for (const rc of mapped.releaseContributors) {
					const artistId = artistIdMap.get(rc.artistName);
					const artistRoleId = maps.artistRole.get(rc.roleCode);
					if (!artistId || !artistRoleId) continue;
					rc.entity.releaseId = releaseId;
					rc.entity.artistId = artistId;
					rc.entity.artistRoleId = artistRoleId;
					await manager.save(ReleaseContributor, rc.entity);
				}

				// Save DSP Deliveries
				for (const delivery of mapped.dspDeliveries) {
					delivery.releaseId = releaseId;
					await manager.save(ReleaseDspDelivery, delivery);
				}

				// Save Tracks + sub-entities
				for (const t of mapped.tracks) {
					t.track.releaseId = releaseId;
					const savedTrack = await manager.save(Track, t.track);
					const trackId = savedTrack.id;

					t.trackLanguage.trackId = trackId;
					await manager.save(TrackLanguage, t.trackLanguage);

					for (const ta of t.trackArtists) {
						const artistId = artistIdMap.get(ta.artistName);
						if (!artistId) continue;
						ta.entity.trackId = trackId;
						ta.entity.artistId = artistId;
						await manager.save(TrackArtist, ta.entity);
					}

					for (const tc of t.trackContributors) {
						const artistId = artistIdMap.get(tc.artistName);
						const artistRoleId = maps.artistRole.get(tc.roleCode);
						if (!artistId || !artistRoleId) continue;
						tc.entity.trackId = trackId;
						tc.entity.artistId = artistId;
						tc.entity.artistRoleId = artistRoleId;
						await manager.save(TrackContributor, tc.entity);
					}

					if (t.audioFile && t.audioStorageKey) {
						t.audioFile.trackId = trackId;

						// Create FileEntity for the uploaded audio
						const ext = path
							.extname(t.audioStorageKey)
							.replace('.', '');
						const fileEntity = new FileEntity();
						fileEntity.fileName = path.basename(t.audioStorageKey);
						fileEntity.key = t.audioStorageKey;
						fileEntity.contentType =
							ext === 'wav'
								? 'audio/wav'
								: ext === 'flac'
									? 'audio/flac'
									: 'audio/mpeg';
						fileEntity.extension = ext;
						fileEntity.fileSize = 0;
						fileEntity.bucket = 'ag-music';

						const savedFile = await manager.save(
							FileEntity,
							fileEntity,
						);

						t.audioFile.fileId = savedFile.id;
						await manager.save(AudioFile, t.audioFile);
					}
				}

				// Save CoverArt thumbnail (original)
				const imageExts = ['.png', '.jpg', '.jpeg'];
				const thumbnailKey = storageKeys.find((k) =>
					imageExts.some((e) => k.toLowerCase().endsWith(e)),
				);
				if (thumbnailKey) {
					const ext = path.extname(thumbnailKey).replace('.', '');
					const fileEntity = new FileEntity();
					fileEntity.fileName = path.basename(thumbnailKey);
					fileEntity.key = thumbnailKey;
					fileEntity.contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
					fileEntity.extension = ext;
					fileEntity.fileSize = 0;
					fileEntity.bucket = 'ag-music';

					const savedFile = await manager.save(
						FileEntity,
						fileEntity,
					);

					const coverArt = new ReleaseCoverArt();
					coverArt.fileId = savedFile.id;
					coverArt.releaseId = releaseId;
					coverArt.width = 0;
					coverArt.height = 0;
					coverArt.type = 'original';
					await manager.save(ReleaseCoverArt, coverArt);
				}

				await queryRunner.commitTransaction();

				log.status = BatchImportStatus.COMPLETED;
				await this.logRepo.save(log);

				const action = isUpdate ? 'updated' : 'created';
				this.logger.log(
					`Release ${action} for "${releaseFolder}" — ${mapped.tracks.length} track(s), releaseId: ${releaseId}`,
				);

				return {
					success: true,
					releaseId,
					trackCount: mapped.tracks.length,
					isUpdate,
					mapped,
				};
			} catch (error) {
				await queryRunner.rollbackTransaction();
				throw error;
			} finally {
				await queryRunner.release();
			}
		} catch (error) {
			console.log(
				'🚀 ~ BatchImportService ~ createReleaseFromExcel ~ error:',
				error,
			);
			const message =
				error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;

			log.status = BatchImportStatus.FAILED;
			this.appendLogError(log, `Create release failed: ${message}`);
			await this.logRepo.save(log);

			this.logger.error(
				`Failed to create release "${releaseFolder}": ${message}`,
				stack,
			);
			return { success: false, error: message, stack: error };
		}
	}

	/**
	 * Delete all sub-entities for an existing release (for upsert).
	 */
	private async deleteReleaseSubEntities(
		manager: EntityManager,
		releaseId: string,
	) {
		// Get all track IDs for this release
		const tracks = await manager.find(Track, {
			where: { releaseId },
			select: ['id'],
		});
		const trackIds = tracks.map((t) => t.id);

		// Delete track sub-entities
		if (trackIds.length > 0) {
			await manager.delete(TrackLanguage, { trackId: In(trackIds) });
			await manager.delete(TrackArtist, { trackId: In(trackIds) });
			await manager.delete(TrackContributor, {
				trackId: In(trackIds),
			});
			await manager.delete(AudioFile, { trackId: In(trackIds) });
		}

		// Delete release sub-entities + tracks
		await Promise.all([
			manager.delete(Track, { releaseId }),
			manager.delete(ReleaseTerritory, { releaseId }),
			manager.delete(ReleaseLanguage, { releaseId }),
			manager.delete(ReleaseArtist, { releaseId }),
			manager.delete(ReleaseContributor, { releaseId }),
			manager.delete(ReleaseDspDelivery, { releaseId }),
		]);
	}

	/**
	 * Append an error message to the log's errors array.
	 */
	private appendLogError(log: BatchImportLog, message: string) {
		log.errors = [...(log.errors || []), message];
	}

	private async buildLookupMaps(): Promise<ExcelLookupMaps> {
		const [
			albumFormats,
			genres,
			labels,
			trackSensitives,
			artistRoles,
			languages,
			dsps,
			artists,
			countries,
			defaultTrackType,
			defaultTrackOriginType,
		] = await Promise.all([
			this.dataSource.getRepository(AlbumFormat).find(),
			this.dataSource.getRepository(Genre).find(),
			this.dataSource.getRepository(Label).find(),
			this.dataSource.getRepository(TrackSensitive).find(),
			this.dataSource.getRepository(ArtistRole).find(),
			this.dataSource.getRepository(Language).find(),
			this.dataSource.getRepository(Dsp).find(),
			this.dataSource.getRepository(Artist).find(),
			this.dataSource.getRepository(Country).find(),
			this.dataSource
				.getRepository(TrackType)
				.findOne({ where: { isDefault: true } }),
			this.dataSource
				.getRepository(TrackOriginType)
				.findOne({ where: { isDefault: true } }),
		]);

		return {
			albumFormat: new Map(albumFormats.map((r) => [r.name, r.id])),
			genre: new Map(genres.map((r) => [r.name, r.id])),
			label: new Map(labels.map((r) => [r.name, r.id])),
			trackSensitive: new Map(trackSensitives.map((r) => [r.name, r.id])),
			artistRole: new Map(artistRoles.map((r) => [r.name, r.id])),
			language: new Map(languages.map((r) => [r.name, r.id])),
			dsp: new Map(dsps.map((r) => [r.name, r.id])),
			artist: new Map(artists.map((r) => [r.name, r.id])),
			country: new Map(countries.map((r) => [r.iso2, r.id])),
			countryByName: new Map(countries.map((r) => [r.name, r.id])),
			defaultTrackTypeId: defaultTrackType?.id || null,
			defaultTrackOriginTypeId: defaultTrackOriginType?.id || null,
		};
	}

	private validateAudioFileNames(
		excelData: Record<string, unknown>[],
		audioFileNames: string[],
		errors: string[],
	): void {
		// Use the centralized column constant
		const isrcColumn =
			excelData[0] && EXCEL_COLUMNS.ISRC in excelData[0]
				? EXCEL_COLUMNS.ISRC
				: null;

		if (!isrcColumn) {
			errors.push(
				'No ISRC column found in Excel data. Expected column named "ISRC".',
			);
			return;
		}

		const isrcValues = excelData
			.map((row) => {
				const val = row[isrcColumn];
				return typeof val === 'string' ? val.trim() : '';
			})
			.filter((v) => v.length > 0);

		for (const fileName of audioFileNames) {
			const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
			if (!isrcValues.includes(nameWithoutExt)) {
				errors.push(
					`Audio file "${fileName}" does not match any ISRC. Expected file name to be {ISRC}.{extension}`,
				);
			}
		}

		for (const isrc of isrcValues) {
			const hasAudio = audioFileNames.some(
				(f) => f.replace(/\.[^.]+$/, '') === isrc,
			);
			if (!hasAudio) {
				errors.push(`Missing audio file for ISRC "${isrc}"`);
			}
		}
	}

	private validateThumbnail(
		releaseFolder: string,
		thumbnailFileName: string | undefined,
		errors: string[],
	): void {
		const allowedExtensions = ['.png', '.jpg', '.jpeg'];

		if (!thumbnailFileName) {
			errors.push(
				`Missing thumbnail. Expected file named "${releaseFolder}.png" (or .jpg, .jpeg)`,
			);
			return;
		}

		const ext = thumbnailFileName
			.substring(thumbnailFileName.lastIndexOf('.'))
			.toLowerCase();
		const nameWithoutExt = thumbnailFileName.replace(/\.[^.]+$/, '');

		if (!allowedExtensions.includes(ext)) {
			errors.push(
				`Thumbnail "${thumbnailFileName}" has invalid format. Allowed: ${allowedExtensions.join(', ')}`,
			);
			return;
		}

		if (nameWithoutExt !== releaseFolder) {
			errors.push(
				`Thumbnail "${thumbnailFileName}" must be named "${releaseFolder}${ext}"`,
			);
		}
	}
}
