import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { TrackScanHistory } from 'src/modules/copyright/entities/track-scan-history.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ReleaseCoverArtService } from 'src/modules/release-cover-art/services/release-cover-art.service';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';
import { ReleaseTerritory } from 'src/modules/release-territory/entities/release-territory.entity';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackContributor } from 'src/modules/track-contributor/entities/track-contributor.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/modules/track-localize/entities/track-localize.entity';
import { TrackOriginType } from 'src/modules/track-origin-type/entities/track-origin-type.entity';
import { TrackPolicy } from 'src/modules/track-policy/entities/track-policy.entity';
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
		private readonly releaseCoverArtService: ReleaseCoverArtService,
	) {}

	async getLogs(params: GetBatchImportLogsDto) {
		const {
			page = 1,
			pageSize = 20,
			batchId,
			upc,
			tenantCode,
			status,
		} = params;

		const qb = this.logRepo.createQueryBuilder('log');

		if (batchId) {
			qb.andWhere('log.batchId LIKE :batchId', {
				batchId: `%${batchId}%`,
			});
		}

		if (upc) {
			qb.andWhere('log.releaseFolder LIKE :upc', {
				upc: `%${upc}%`,
			});
		}

		if (tenantCode) {
			qb.andWhere('log.tenantCode LIKE :tenantCode', {
				tenantCode: `%${tenantCode}%`,
			});
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

	async logFailedRelease(logId: string, errorMsg: string, rawError?: any) {
		const log = await this.logRepo.findOneBy({ id: logId });
		if (!log) {
			throw new Error(`Log record not found: ${logId}`);
		}

		log.status = BatchImportStatus.FAILED;
		this.appendLogError(log, errorMsg);

		if (rawError) {
			const rawErrorStr =
				typeof rawError === 'string'
					? rawError
					: JSON.stringify(
							rawError,
							Object.getOwnPropertyNames(rawError),
						);
			this.appendLogError(log, `Raw Error: ${rawErrorStr}`);
		}

		await this.logRepo.save(log);

		this.logger.log(
			`Logged failed release for logId "${logId}": ${errorMsg}`,
		);

		return { success: true };
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

		let log = await this.logRepo.findOne({
			where: { batchId, releaseFolder },
		});

		if (!log) {
			log = this.logRepo.create({
				tenantCode,
				batchId,
				releaseFolder,
				status: isValid
					? BatchImportStatus.VALIDATED
					: BatchImportStatus.VALIDATION_FAILED,
				excelData,
				errors: errors.length > 0 ? errors : null,
			});
		} else {
			log.status = isValid
				? BatchImportStatus.VALIDATED
				: BatchImportStatus.VALIDATION_FAILED;
			log.excelData = excelData;
			log.errors = errors.length > 0 ? errors : null;
		}

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
			fileIds,
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

			// Surface mapping warnings in the batch import log
			if (mapped.warnings.length > 0) {
				for (const w of mapped.warnings) {
					this.appendLogError(log, w);
				}
				await this.logRepo.save(log);
			}

			// Validate required FK fields before attempting DB insert
			const missingFields: string[] = [];
			if (!mapped.release.albumFormatId) {
				missingFields.push('Album Format (Release Type)');
			}
			if (missingFields.length > 0) {
				const msg = `Cannot create release: missing required field(s): ${missingFields.join(', ')}. Please check the Excel data.`;
				log.status = BatchImportStatus.FAILED;
				this.appendLogError(log, msg);
				await this.logRepo.save(log);
				this.logger.error(`Release "${releaseFolder}" aborted: ${msg}`);
				return { success: false, error: msg };
			}

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
						`[LOG] Existing release found for UPC "${upc}" (id: ${releaseId}). Updating release.`,
					);

					// Delete all old sub-entities (including localizes)
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
						releaseOriginalDate: mapped.release.releaseOriginalDate,
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
				const insertedReleaseArtistIds = new Set<string>();
				for (const ra of mapped.releaseArtists) {
					const artistId = artistIdMap.get(ra.artistName);
					if (!artistId || insertedReleaseArtistIds.has(artistId))
						continue;

					insertedReleaseArtistIds.add(artistId);
					ra.entity.releaseId = releaseId;
					ra.entity.artistId = artistId;
					await manager.save(ReleaseArtist, ra.entity);
				}

				// Save ReleaseContributors
				const insertedReleaseContributorKeys = new Set<string>();
				for (const rc of mapped.releaseContributors) {
					const artistId = artistIdMap.get(rc.artistName);
					const artistRoleId = maps.artistRole.get(rc.roleCode);
					if (!artistId || !artistRoleId) continue;

					const key = `${artistId}-${artistRoleId}`;
					if (insertedReleaseContributorKeys.has(key)) continue;

					insertedReleaseContributorKeys.add(key);
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

					const insertedTrackArtistIds = new Set<string>();
					for (const ta of t.trackArtists) {
						const artistId = artistIdMap.get(ta.artistName);
						if (!artistId || insertedTrackArtistIds.has(artistId))
							continue;

						insertedTrackArtistIds.add(artistId);
						ta.entity.trackId = trackId;
						ta.entity.artistId = artistId;
						await manager.save(TrackArtist, ta.entity);
					}

					const insertedTrackContributorKeys = new Set<string>();
					for (const tc of t.trackContributors) {
						const artistId = artistIdMap.get(tc.artistName);
						const artistRoleId = maps.artistRole.get(tc.roleCode);
						if (!artistId || !artistRoleId) continue;

						const key = `${artistId}-${artistRoleId}`;
						if (insertedTrackContributorKeys.has(key)) continue;

						insertedTrackContributorKeys.add(key);
						tc.entity.trackId = trackId;
						tc.entity.artistId = artistId;
						tc.entity.artistRoleId = artistRoleId;
						await manager.save(TrackContributor, tc.entity);
					}

					if (t.audioFile && t.audioStorageKey) {
						t.audioFile.trackId = trackId;

						let savedFileId: string | undefined;

						// If fileIds were passed, try to find the pre-created FileEntity by key
						if (fileIds && fileIds.length > 0) {
							const existingFile = await manager.findOne(
								FileEntity,
								{
									where: { key: t.audioStorageKey },
									select: ['id'],
								},
							);
							if (existingFile) {
								savedFileId = existingFile.id;
							}
						}

						// Fallback: create manually if not found (for legacy or error cases)
						if (!savedFileId) {
							const ext = path
								.extname(t.audioStorageKey)
								.replace('.', '');
							const fileEntity = new FileEntity();
							fileEntity.fileName = path.basename(
								t.audioStorageKey,
							);
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
							savedFileId = savedFile.id;
						}

						t.audioFile.fileId = savedFileId;
						await manager.save(AudioFile, t.audioFile);
					}

					// Save Track Localizes (secondary language titles)
					for (const tl of t.trackLocalizes) {
						tl.trackId = trackId;
						if (tl.languageId) {
							await manager.save(TrackLocalize, tl);
						}
					}
				}

				// Save CoverArt — original + all resized variants (75x75, 100x100, 160x160, 300x300)
				const imageExts = ['.png', '.jpg', '.jpeg'];
				const thumbnailKey = storageKeys.find((k) =>
					imageExts.some((e) => k.toLowerCase().endsWith(e)),
				);
				if (thumbnailKey) {
					let savedFileId: string | undefined;

					// If fileIds were passed, try to find the pre-created FileEntity by key
					if (fileIds && fileIds.length > 0) {
						const existingFile = await manager.findOne(FileEntity, {
							where: { key: thumbnailKey },
							select: ['id'],
						});
						if (existingFile) {
							savedFileId = existingFile.id;
						}
					}

					// Fallback: create manually if not found (for legacy or error cases)
					if (!savedFileId) {
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
						savedFileId = savedFile.id;
					}

					// Generate all cover art sizes (original + 75x75, 100x100, 160x160, 300x300)
					// Reuses the existing resize pipeline from ReleaseCoverArtService
					await this.releaseCoverArtService.generateCoverArtsForBatchImport(
						{
							fileCoverArtOriginalId: savedFileId,
							releaseId,
							manager,
						},
					);
				}

				// Save Release Localizes (secondary language titles)
				for (const rl of mapped.releaseLocalizes) {
					rl.releaseId = releaseId;
					if (rl.languageId) {
						await manager.save(ReleaseLocalize, rl);
					}
				}

				// Update log status inside the transaction for atomicity
				// (prevents stuck 'creating' state if server crashes after commit)
				log.status = BatchImportStatus.COMPLETED;
				await manager.save(log);

				await queryRunner.commitTransaction();

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
				(error instanceof Error ? error.message : String(error)) ||
				'Unknown error (empty message)';
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
			await manager.delete(TrackLocalize, { trackId: In(trackIds) });
			await manager.delete(AudioFile, { trackId: In(trackIds) });
			await manager.delete(TrackPolicy, { trackId: In(trackIds) });
			await manager.delete(TrackScanHistory, { trackId: In(trackIds) });
		}

		// Delete release sub-entities + tracks
		await Promise.all([
			manager.delete(Track, { releaseId }),
			manager.delete(ReleaseTerritory, { releaseId }),
			manager.delete(ReleaseLanguage, { releaseId }),
			manager.delete(ReleaseArtist, { releaseId }),
			manager.delete(ReleaseContributor, { releaseId }),
			manager.delete(ReleaseLocalize, { releaseId }),
			manager.delete(ReleaseDspDelivery, { releaseId }),
			manager.delete(ReleaseCoverArt, { releaseId }),
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
			priceTiers,
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
			this.dataSource.getRepository(PriceTier).find({
				relations: { currency: true },
				where: { isActive: true },
			}),
			this.dataSource
				.getRepository(TrackType)
				.findOne({ where: { isDefault: true } }),
			this.dataSource
				.getRepository(TrackOriginType)
				.findOne({ where: { isDefault: true } }),
		]);

		return {
			albumFormat: new Map(
				albumFormats.map((r) => [r.name.toLowerCase(), r.id]),
			),
			genre: new Map(genres.map((r) => [r.name, r.id])),
			label: new Map(labels.map((r) => [r.name, r.id])),
			trackSensitive: new Map(trackSensitives.map((r) => [r.name, r.id])),
			artistRole: new Map(artistRoles.map((r) => [r.name, r.id])),
			language: new Map([
				...languages.map((r) => [r.name, r.id] as [string, string]),
				...languages.map(
					(r) => [`${r.name} - ${r.code}`, r.id] as [string, string],
				),
			]),
			dsp: new Map(dsps.map((r) => [r.name, r.id])),
			artist: new Map(artists.map((r) => [r.name, r.id])),
			country: new Map(countries.map((r) => [r.iso2, r.id])),
			countryByName: new Map(countries.map((r) => [r.name, r.id])),
			priceTier: new Map(
				priceTiers.map((r) => [
					`${r.amount}|${r.currency?.code}`,
					r.id,
				]),
			),
			defaultPriceTierId: priceTiers.find((r) => r.isDefault)?.id || null,
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
