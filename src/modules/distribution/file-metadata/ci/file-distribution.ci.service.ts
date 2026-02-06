import { NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Country } from 'src/modules/country/entities/country.entity';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import { Release } from 'src/modules/release/entities/release.entity';
import { In, Repository } from 'typeorm';
import XlsxPopulate from 'xlsx-populate';
import { GENRE_MAPPING, LANGUAGE_MAPPING } from './const';

import { ImportReleaseCiDto } from './dto';
import {
	CiJobStatus,
	DistributionCiHistory,
} from './file-distribution.ci.entity';
import { CI_COLUMN_MAP, CiRawRow } from './interface';

export class FileDistributionCiService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,

		@InjectRepository(DistributionCiHistory)
		private readonly ciHistoryRepo: Repository<DistributionCiHistory>,

		private readonly bucketService: BucketService,
		// private readonly sftpService: SftpService,
	) {}

	// import
	// parseRelease -> folder local -> push to folder ci (sftp)

	async importRelease({ releaseId, batchId }: ImportReleaseCiDto): Promise<{
		upc: string;
		localDir: string;
		remoteDir: string;
	}> {
		// 1) parse -> local

		const { outputDir: localDir, upc } = await this.parseRelease(
			releaseId,
			batchId,
		);

		// 2) build remote dir
		// const remoteDir = this.buildCiRemoteDir(batchId, upc);

		const remoteDir = '/import';

		// 3) upload folder lên SFTP
		try {
			// await this.sftpService.uploadFolder(localDir, remoteDir);
		} catch (err: any) {
			// Parse đã SUCCESS nhưng upload FAIL.
			// Entity hiện tại không có "uploadStatus", nên mình ghi lỗi vào history mới nhất của release+batch.
			const last = await this.ciHistoryRepo.findOne({
				where: { releaseId, batchId, upc },
				order: { createdAt: 'DESC' },
			});

			if (last) {
				await this.ciHistoryRepo.update(last.id, {
					status: CiJobStatus.FAILED,
					errorMessage: `[SFTP_UPLOAD_FAILED] ${err?.message ?? String(err)}`,
					errorStack: err?.stack ?? null,
				});
			}

			throw err;
		}

		// 4) (optional) cleanup local nếu muốn
		// fs.rmSync(localDir, { recursive: true, force: true });

		return { upc, localDir, remoteDir };
	}

	// export
	//

	async parseRelease(
		releaseId: string,
		batchId: string,
	): Promise<{ outputDir: string; upc: string }> {
		const startedAt = new Date();

		const history = await this.ciHistoryRepo.save(
			this.ciHistoryRepo.create({
				releaseId,
				batchId,
				status: CiJobStatus.RUNNING,
				startedAt,
			}),
		);

		try {
			const release = await this.findOneRelease(releaseId);

			const upc = release.upc;
			if (!upc) {
				throw new Error(`Bỏ qua release (không có UPC): ${release.id}`);
			}

			const outputRoot = path.resolve('release_parsed', batchId);
			const templatePath = path.resolve(
				'src/modules/access-bomb/file/file-ci.xlsx',
			);

			const releaseDir = path.join(outputRoot, upc);
			fs.mkdirSync(releaseDir, { recursive: true });

			const { audioFiles, coverImage } =
				await this.fetchFilesFromGCS(release);

			const coverPath = await this.processCoverImage(
				coverImage,
				releaseDir,
				upc,
			);

			this.processTracks(release, audioFiles, releaseDir, upc);

			const rows = await this.parseCiRawRowsFromRelease(release);
			const excelPath = path.join(releaseDir, `${upc}.xlsx`);

			await this.createCiExcel({
				templatePath,
				outputPath: excelPath,
				rows,
			});

			const finishedAt = new Date();

			await this.ciHistoryRepo.update(history.id, {
				status: CiJobStatus.SUCCESS,
				upc,
				outputDir: releaseDir,
				excelPath,
				coverPath: coverPath ?? null,
				trackCount: release.tracks?.length ?? 0,
				finishedAt,
				durationMs: finishedAt.getTime() - startedAt.getTime(),
			});

			// ✅ TRẢ RA NƠI LƯU
			return {
				outputDir: releaseDir,
				upc,
			};
		} catch (err: any) {
			const finishedAt = new Date();

			await this.ciHistoryRepo.update(history.id, {
				status: CiJobStatus.FAILED,
				finishedAt,
				durationMs: finishedAt.getTime() - startedAt.getTime(),
				errorMessage: err?.message ?? String(err),
				errorStack: err?.stack ?? null,
			});

			throw err;
		}
	}

	// private
	private async findOneRelease(releaseId: string): Promise<Release> {
		const qb = this.releaseRepo
			.createQueryBuilder('release')
			.where('release.id = :releaseId', { releaseId })

			// ===== release level =====
			.leftJoinAndSelect('release.label', 'label')
			.leftJoinAndSelect('release.primaryGenre', 'releasePrimaryGenre')
			.leftJoinAndSelect('release.subGenre', 'releaseSubGenre')
			.leftJoinAndSelect('release.releaseArtists', 'releaseArtists')
			.leftJoinAndSelect('releaseArtists.artist', 'releaseArtist')

			.leftJoinAndSelect('release.releaseCoverArts', 'releaseCoverArts')
			.leftJoinAndSelect('release.releaseTerritory', 'releaseTerritory')
			.leftJoinAndSelect('release.albumFormat', 'albumFormat')

			// ===== tracks =====
			.leftJoinAndSelect('release.tracks', 'track')
			.leftJoinAndSelect('track.audioFile', 'audioFile')

			.leftJoinAndSelect('track.primaryGenre', 'trackPrimaryGenre')
			.leftJoinAndSelect('track.subGenre', 'trackSubGenre')

			.leftJoinAndSelect('track.trackArtists', 'trackArtists')
			.leftJoinAndSelect('trackArtists.artist', 'trackArtist')

			.leftJoinAndSelect('track.trackSensitive', 'trackSensitive')

			.leftJoinAndSelect('track.trackLanguage', 'trackLanguage')
			.leftJoinAndSelect('trackLanguage.audioLanguage', 'audioLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguage',
				'metadataLanguage',
			)

			.leftJoinAndSelect('track.trackContributors', 'trackContributors')
			.leftJoinAndSelect(
				'trackContributors.artistRole',
				'contributorRole',
			)
			.leftJoinAndSelect('trackContributors.artist', 'contributorArtist')

			.orderBy('track.order', 'ASC');

		const release = await qb.getOne();

		if (!release) {
			throw new NotFoundException(`Release not found: ${releaseId}`);
		}

		release.tracks = release.tracks ?? [];
		release.releaseArtists = release.releaseArtists ?? [];
		release.releaseCoverArts = release.releaseCoverArts ?? [];

		return release;
	}

	// ===== fetch files =====
	private async fetchFilesFromGCS(release: Release): Promise<{
		audioFiles: { buffer: Buffer; extension: string }[];
		coverImage: { buffer: Buffer; extension: string };
	}> {
		const audioFiles: { buffer: Buffer; extension: string }[] = [];
		const tracks = [...release.tracks].sort((a, b) => a.order - b.order);

		for (const track of tracks) {
			if (!track.audioFile) continue;

			const { fileBuffer, fileDb } =
				await this.bucketService.getFileBuffer(track.audioFile.fileId);

			audioFiles.push({
				buffer: fileBuffer,
				extension: fileDb.extension,
			});
		}

		const coverArt = release.releaseCoverArts?.find(
			(art) => art.type === 'original',
		);

		if (!coverArt) throw new Error('Release has no original cover image');

		const { fileBuffer: coverBuffer, fileDb: coverDb } =
			await this.bucketService.getFileBuffer(coverArt.fileId);

		return {
			audioFiles,
			coverImage: { buffer: coverBuffer, extension: coverDb.extension },
		};
	}

	// ===== cover =====
	private async processCoverImage(
		coverImage: { buffer: Buffer; extension: string },
		releaseDir: string,
		upc: string,
	): Promise<string | null> {
		if (!coverImage?.buffer) return null;

		// NOTE: extension trong db có thể là "jpg" hoặc ".jpg"
		const rawExt = (coverImage.extension || 'jpg').toLowerCase();
		const ext = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;

		const outputPath = path.join(releaseDir, `${upc}${ext}`);

		const img = sharp(coverImage.buffer);
		const meta = await img.metadata();

		const oldWidth = meta.width ?? 0;
		const oldHeight = meta.height ?? 0;

		if (oldWidth >= 3000 && oldHeight >= 3000) {
			fs.writeFileSync(outputPath, coverImage.buffer);
			console.log(
				`[IMAGE_COPY] UPC=${upc} size=${oldWidth}x${oldHeight} -> ${outputPath}`,
			);
			return outputPath;
		}

		console.log(
			`[IMAGE_RESIZE] UPC=${upc} size=${oldWidth}x${oldHeight} resize 3000x3000 -> ${outputPath}`,
		);

		const safeExt = [
			'.jpg',
			'.jpeg',
			'.png',
			'.webp',
			'.tif',
			'.tiff',
		].includes(ext)
			? ext
			: '.jpg';

		const finalOutputPath =
			safeExt === ext ? outputPath : path.join(releaseDir, `${upc}.jpg`);

		await img.resize(3000, 3000, { fit: 'cover' }).toFile(finalOutputPath);

		console.log(`[IMAGE_RESIZE] saved -> ${finalOutputPath}`);
		return finalOutputPath;
	}

	// ===== tracks =====
	private processTracks(
		release: Release,
		audioFiles: { buffer: Buffer; extension: string }[],
		releaseDir: string,
		upc: string,
	) {
		const tracks = [...release.tracks].sort((a, b) => a.order - b.order);

		tracks.forEach((track, index) => {
			if (!track.audioFile) {
				console.warn(`Track ${track.order} không có file âm thanh`);
				return;
			}

			const audio = audioFiles[index];
			if (!audio?.buffer) {
				console.warn(
					`Không tìm thấy file âm thanh cho track ${track.order}`,
				);
				return;
			}

			const rawExt = (audio.extension || 'mp3').toLowerCase();
			const ext = rawExt.startsWith('.') ? rawExt.slice(1) : rawExt;

			const trackNo = String(track.order).padStart(2, '0');
			const fileName = `${upc}_01_${trackNo}.${ext}`;
			const filePath = path.join(releaseDir, fileName);

			fs.writeFileSync(filePath, audio.buffer);
			console.log(`[TRACK_COPY] ${fileName}`);
		});
	}

	private async parseCiRawRowsFromRelease(
		release: Release,
	): Promise<CiRawRow[]> {
		const formatCiDate = (value: Date | string) => {
			const d = value instanceof Date ? value : new Date(value);
			return [
				d.getFullYear(),
				String(d.getMonth() + 1).padStart(2, '0'),
				String(d.getDate()).padStart(2, '0'),
			].join('/');
		};

		const territory = release.releaseTerritory;

		let licensedTerritoriesInclude = '';
		let licensedTerritoriesExclude: string | null = null;

		if (territory?.distributeWorldwide === true) {
			licensedTerritoriesInclude = 'WORLD';
			licensedTerritoriesExclude = null;
		} else {
			const ids = territory?.selectedCountries ?? [];

			const countries = ids.length
				? await this.countryRepo.find({
						where: { id: In(ids) },
						select: { name: true },
					})
				: [];

			const countryNames = countries.map((c) => c.name).join('|');

			switch (territory?.distributionType) {
				case DistributionType.DISTRIBUTE_EVERYWHERE_EXCEPT:
					licensedTerritoriesInclude = 'WORLD';
					licensedTerritoriesExclude = countryNames || null;
					break;

				case DistributionType.DISTRIBUTE_ONLY_IN:
					licensedTerritoriesInclude = countryNames || '';
					licensedTerritoriesExclude = null;
					break;

				default:
					licensedTerritoriesInclude = '';
					licensedTerritoriesExclude = null;
			}
		}

		const releaseArtist = (release.releaseArtists ?? []).map(
			(c) => c.artist.name,
		);

		const isExplicit = (release.tracks ?? []).some(
			(t) => t.trackSensitive?.code === 'PARENTAL_ADVISORY',
		);

		return (release.tracks ?? [])
			.sort((a, b) => a.order - b.order)
			.map((track, i) => {
				let hasVocalsOrLanguage = 'No linguistic content - zxx';
				if (track.trackLanguage) {
					const audioLanguage = track.trackLanguage.audioLanguage;
					const metadataLanguage =
						track.trackLanguage.metadataLanguage;

					if (audioLanguage && LANGUAGE_MAPPING[audioLanguage.code]) {
						hasVocalsOrLanguage =
							LANGUAGE_MAPPING[audioLanguage.code];
					} else if (
						metadataLanguage &&
						LANGUAGE_MAPPING[metadataLanguage.code]
					) {
						hasVocalsOrLanguage =
							LANGUAGE_MAPPING[metadataLanguage.code];
					}
				}

				const trackArtists = (track.trackArtists ?? []).map(
					(ta) => ta.artist.name,
				);

				return {
					checkNo: 1,
					groupingId: null,
					releaseTitle: release.title,
					versionDescription: release.version ?? null,
					artist: releaseArtist.join('|'),
					displayArtist: releaseArtist.join(' feat '),
					gtin: release.upc ?? '',
					catalogueNo:
						release.catalogId ??
						`${release.label?.name}_${release.upc}`,
					releaseFormatType: release.albumFormat?.name ?? null,
					soundCarrier: null,
					priceBand: 'Mid',

					licensedTerritoriesInclude,
					licensedTerritoriesExclude, // ✅ dùng đúng giá trị đã tính

					releaseStartDate: release.releaseDate
						? formatCiDate(release.releaseDate)
						: null,
					releaseEndDate: null,

					grid: null,
					pYear: release.pLineYear ?? 0,
					pHolder: release.pLineOwner ?? '',
					cYear: release.cLineYear,
					cHolder: release.cLineOwner,
					status: null,
					label: release.label?.name ?? '',

					mainGenre: release.primaryGenre?.name
						? GENRE_MAPPING[release.primaryGenre.name]
						: 'null',
					mainSubGenre: null,

					alternateGenre: release.subGenre?.name
						? (GENRE_MAPPING[release.subGenre.name] ??
							release.subGenre.name)
						: 'null',

					alternateSubGenre: null,

					explicitContent: isExplicit ? 'Y' : 'N',

					volumeNo: 1,
					volumeTotal: 1,
					services: null,

					trackNo: i + 1,
					trackTitle: track.title,
					trackVersion: track.version ?? null,
					trackArtist: trackArtists.join('|'),
					trackDisplayArtist: trackArtists.join(' and '),
					isrc: track.isrc ?? '',
					trackGrid: null,
					availableSeparately: 'Y',

					trackPYear: track.pLineYear ?? 0,
					trackPHolder: track.pLineOwner ?? '',

					trackMainGenre: track.primaryGenre?.name
						? (GENRE_MAPPING[track.primaryGenre.name] ??
							track.primaryGenre.name)
						: release.primaryGenre?.name
							? (GENRE_MAPPING[release.primaryGenre.name] ??
								release.primaryGenre.name)
							: 'null',

					trackMainSubGenre: null,

					trackAlternateGenre: track.subGenre?.name
						? (GENRE_MAPPING[track.subGenre.name] ??
							track.subGenre.name)
						: release.subGenre?.name
							? (GENRE_MAPPING[release.subGenre.name] ??
								release.subGenre.name)
							: null,
					trackAlternateSubGenre: null,

					trackExplicitContent:
						track.trackSensitive?.code === 'PARENTAL_ADVISORY'
							? 'Y'
							: 'N',

					producers:
						track.trackContributors
							?.filter((tc) => tc.artistRole?.code === 'PRODUCER')
							.map((tc) => tc.artist?.name)
							.filter(Boolean)
							.join('|') || '',

					mixers:
						track.trackContributors
							?.filter((tc) => tc.artistRole?.code === 'MIXER')
							.map((tc) => tc.artist?.name)
							.filter(Boolean)
							.join('|') || '',

					composers:
						track.trackContributors
							?.filter((tc) => tc.artistRole?.code === 'COMPOSER')
							.map((tc) => tc.artist?.name)
							.filter(Boolean)
							.join('|') || '',

					lyricists:
						hasVocalsOrLanguage === 'No linguistic content - zxx'
							? null
							: track.trackContributors
									?.filter((c) =>
										[
											'LYRICIST',
											'COMPOSER_LYRICIST',
										].includes(c.artistRole?.code),
									)
									.map((c) => c.artist?.name)
									.filter(Boolean)
									.join('|') || null,

					publishers: null,

					hasInstruments: 'Y',
					hasVocalsOrLanguage,
					previewStartTime: 30,
					originalReleaseDate: null,
				};
			});
	}

	private async createCiExcel(input: {
		templatePath: string;
		outputPath: string;
		rows: CiRawRow[];
	}) {
		const { templatePath, outputPath, rows } = input;

		fs.copyFileSync(templatePath, outputPath);

		const workbook = await XlsxPopulate.fromFileAsync(outputPath);
		const sheet = workbook.sheet('METADATA TEMPLATE');
		if (!sheet) throw new Error('Không tìm thấy sheet "METADATA TEMPLATE"');

		const START_ROW = 15;

		rows.forEach((r, i) => {
			const row = START_ROW + i;

			(Object.keys(CI_COLUMN_MAP) as (keyof CiRawRow)[]).forEach(
				(key) => {
					const col = CI_COLUMN_MAP[key];
					const val = r[key];
					if (val === undefined) return;
					sheet.cell(`${col}${row}`).value(val === null ? '' : val);
				},
			);
		});

		await workbook.toFileAsync(outputPath);
		console.log('[CREATE_EXCEL] Đã tạo file Excel:', outputPath);
	}
}
