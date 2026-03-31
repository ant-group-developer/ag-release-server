import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as fs from 'fs';
import mime from 'mime-types';
import pLimit from 'p-limit';
import * as path from 'path';
import { AppEvent } from 'src/common/enums/common';
import { CreateBucketDto } from 'src/modules/bucket2/dto/bucket.dto';
import { UploadPurpose } from 'src/modules/bucket2/enum/bucket.enum';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { Country } from 'src/modules/country/entities/country.entity';
import { AggregatorCode } from 'src/modules/distribution/aggregator/enum/distribution.enum';
import { AggregatorsService } from 'src/modules/distribution/aggregator/services/aggregators.service';
import {
	GENRE_MAPPING,
	LANGUAGE_MAPPING,
} from 'src/modules/distribution/file-metadata/ci/const';
import {
	CI_COLUMN_MAP,
	CiRawRow,
} from 'src/modules/distribution/file-metadata/ci/interface';
import { SftpConfigsService } from 'src/modules/distribution/sftp-configs/services/sftp-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import { removeFolder, resizeCoverImageTo3000x3000 } from 'src/utils/util';
import { In, Repository } from 'typeorm';
import XlsxPopulate from 'xlsx-populate';
import { ReleaseException } from '../constants/release.constant';
import { Release } from '../entities/release.entity';
import { ReleaseDdexService } from './release-ddex.service';
import { ReleaseQueryService } from './release.query.service';

@Injectable()
export class ReleaseDdexCiService {
	private readonly logger = new Logger(ReleaseDdexCiService.name);

	// CI DPID (Party ID)
	private DDEX_PARTY_ID_CI: string;
	private DDEX_PARTY_NAME_CI: string;

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseQuery: ReleaseQueryService,

		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,

		private readonly bucketSv: BucketService2,
		private readonly sftpConfigsService: SftpConfigsService,
		private readonly sftpConnectService: SftpConnectService,

		private readonly releaseDdexService: ReleaseDdexService,

		private readonly aggregatorsService: AggregatorsService,
	) {}

	async parseMetadata(releaseId: string) {
		// parseMetadataCi
		await this.parseMetadataCi(releaseId);

		// parseMetadataSpotify
	}

	// ci
	async parseMetadataCi(releaseId: string) {
		await this.createMetadataFolderCiAndUploadToBucket(releaseId);
		await this.uploadMetadataFolderCiToSftp(releaseId);
	}

	async createMetadataCiAndUploadToSftp(releaseId: string) {
		await this.createMetadataFolderCiAndUploadToBucket(releaseId);
		await this.uploadMetadataFolderCiToSftp(releaseId);
	}

	async createMetadataFolderCiAndUploadToBucket(releaseId: string) {
		// b1
		await this.createMetadataFolderCiOnServer(releaseId);

		// b2
		await this.uploadMetadataFolderCiToBucket({
			releaseId,
		});
	}

	// async createMetadataDdexCi(releaseId: string) {
	// 	const release = await this.releaseQuery.findOneReleaseFull(releaseId);
	// }

	async createMetadataFolderCiOnServer(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);
		const batchId = Date.now().toString();
		this.logger.log(batchId);

		const { upc } = release;
		if (!upc) {
			throw ReleaseException.MISSING_UPC();
		}

		const outputRoot = path.resolve('release_parsed', batchId);
		const templatePath = path.resolve(
			'src/modules/access-bomb/file/file-ci.xlsx',
		);

		const releaseDir = path.join(outputRoot, upc);
		fs.mkdirSync(releaseDir, { recursive: true });

		// image
		const { audioFiles, coverImage } =
			await this.fetchAudioAndImageReleaseFromBucket(release);

		await this.processCoverImageCi(coverImage, releaseDir, upc);

		// tracks
		this.processTracksCi(release, audioFiles, releaseDir, upc);

		await this.processFileExcelCi({
			release,
			upc,
			releaseDir,
			templatePath,
		});

		const outputDir = outputRoot.replace(/\\/g, '/');

		await this.releaseRepo.update(releaseId, {
			metadataCi: {
				...release.metadataCi,
				batchId,
				folderServer: outputDir,
			},
		});

		return { outputDir, batchId };
	}

	async uploadMetadataFolderCiToBucket({
		// localDir,
		releaseId,
	}: {
		// localDir: string;
		releaseId: string;
	}) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);
		const localDir = release.metadataCi?.folderServer ?? '';

		const bucketDtos: CreateBucketDto[] = [];
		const folderBucket = `releases/${releaseId}/release_metadata_ci/${release.metadataCi?.batchId}/${release.upc}`;

		// b1: quét folder, build input cho bulkCreate
		const walk = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const fullPath = path.join(dir, entry.name);

				if (entry.isDirectory()) {
					walk(fullPath);
					continue;
				}

				if (!entry.isFile()) continue;

				const stat = fs.statSync(fullPath);
				const relativePath = path
					.relative(localDir, fullPath)
					.replace(/\\/g, '/');

				bucketDtos.push({
					file: {
						fileName: entry.name,
						contentType:
							mime.lookup(fullPath) || 'application/octet-stream',
						extension: path.extname(entry.name).replace('.', ''),
						fileSize: stat.size,
					},
					folderBucket: {
						uploadPurpose: UploadPurpose.release_metadata_ci,
						key: `${folderBucket}/${entry.name}`,
					},
					key: relativePath,
				});
			}
		};

		walk(localDir);

		// b2: tạo record + signed url
		const results = await this.bucketSv.bulkCreate({
			bucketDtos,
		});

		// b3: upload từng file lên bucket bằng signed url
		const limit = pLimit(3);

		await Promise.all(
			results.map((res) =>
				limit(async () => {
					if (!res.key) return;

					const localPath = path.join(localDir, res.key);
					const contentType =
						mime.lookup(localPath) || 'application/octet-stream';

					const stream = fs.createReadStream(localPath);

					await axios.put(res.urlUpload, stream, {
						headers: { 'Content-Type': contentType },
						maxBodyLength: Infinity,
					});
				}),
			),
		);

		// b4: xoá folder local sau khi upload THÀNH CÔNG
		await removeFolder(localDir);

		await this.releaseRepo.update(releaseId, {
			metadataCi: {
				...release.metadataCi,
				folderBucket,
			},
		});

		return {
			folderBucket,
		};
	}

	async downloadMetadataCiFromBucket(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);

		if (!release.metadataCi?.folderBucket) {
			throw ReleaseException.MISSING_PREFIX_KEY_BUCKET_METADATA_CI();
		}

		await this.bucketSv.downloadFolder({
			prefix: release.metadataCi.folderBucket,
			destFolder: release.metadataCi.folderServer ?? '',
		});
	}

	async uploadMetadataFolderCiToSftp(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);

		const sftp = await this.sftpConfigsService.getSftpCi();

		await this.downloadMetadataCiFromBucket(releaseId);

		await this.sftpConnectService.uploadFolder({
			sftp,
			localDir: release.metadataCi?.folderServer ?? '',
			remoteDir: sftp.path ?? '',
		});

		await removeFolder(release.metadataCi?.folderServer ?? '');
	}

	// private
	private async fetchAudioAndImageReleaseFromBucket(
		release: Release,
	): Promise<{
		audioFiles: { buffer: Buffer; extension: string }[];
		coverImage: { buffer: Buffer; extension: string };
	}> {
		const audioFiles: { buffer: Buffer; extension: string }[] = [];
		const tracks = [...release.tracks].sort((a, b) => a.order - b.order);

		for (const track of tracks) {
			if (!track.audioFile) continue;

			const { fileBuffer, fileDb } = await this.bucketSv.getFileBuffer(
				track.audioFile.fileId,
			);

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
			await this.bucketSv.getFileBuffer(coverArt.fileId);

		return {
			audioFiles,
			coverImage: { buffer: coverBuffer, extension: coverDb.extension },
		};
	}

	// ci
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
					licensedTerritoriesExclude,

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

	private async processFileExcelCi({
		release,
		releaseDir,
		upc,
		templatePath,
	}: {
		release: Release;
		releaseDir: string;
		upc: string;
		templatePath: string;
	}) {
		const rows = await this.parseCiRawRowsFromRelease(release);
		const excelPath = path.join(releaseDir, `${upc}.xlsx`);

		await this.createCiExcel({
			templatePath,
			outputPath: excelPath,
			rows,
		});
	}

	private async createCiExcel({
		templatePath,
		outputPath,
		rows,
	}: {
		templatePath: string;
		outputPath: string;
		rows: CiRawRow[];
	}) {
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

	private async processCoverImageCi(
		coverImage: { buffer: Buffer; extension: string },
		releaseDir: string,
		upc: string,
	): Promise<string> {
		const img = await resizeCoverImageTo3000x3000({
			buffer: coverImage.buffer,
		});

		const rawExt = (coverImage.extension || 'jpg').toLowerCase();
		const ext = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;

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

		const outputPath = path.join(releaseDir, `${upc}${safeExt}`);
		await img.toFile(outputPath);
		return outputPath;
	}

	// ===== tracks =====
	private processTracksCi(
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

	async createMetadataDdexCiOnServer({
		releaseId,
		recipient,
	}: {
		releaseId: string;
		recipient: {
			partyId: string;
			name: string;
		};
	}) {
		await this.releaseDdexService.createMetadataOnServer({
			releaseId,
			ernVersion: '3.8.2',
			sender: {
				partyId: this.DDEX_PARTY_ID_CI,
				name: this.DDEX_PARTY_NAME_CI,
			},
			recipient,
		});
	}

	async uploadMetadataDdexCiToSftp(releaseId: string) {
		await this.releaseDdexService.uploadMetadataDdexCiToSftp(releaseId);
	}

	// /
	async createAndUploadMetadataDdexCi({
		recipient,
		releaseId,
	}: {
		releaseId: string;
		recipient: { partyId: string; name: string };
	}) {
		await this.createMetadataDdexCiOnServer({ releaseId, recipient });
		await this.uploadMetadataDdexCiToSftp(releaseId);
	}

	// private
	@OnEvent(AppEvent.UPDATE_DDEX_PARTY)
	async handleDdexPartyUpdated() {
		await this.reloadConfig();
	}

	async onModuleInit() {
		await this.reloadConfig();
	}

	private async reloadConfig() {
		const { ddexId, ddexName } = await this.aggregatorsService.getDdexParty(
			{ aggregatorCode: AggregatorCode.CI },
		);

		this.DDEX_PARTY_ID_CI = ddexId;
		this.DDEX_PARTY_NAME_CI = ddexName;
	}
}
