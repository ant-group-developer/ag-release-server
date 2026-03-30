import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';

import * as crypto from 'crypto';

import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { CountryService } from 'src/modules/country/services/country.service';
import { AggregatorCode } from 'src/modules/distribution/aggregator/enum/distribution.enum';
import { AggregatorsService } from 'src/modules/distribution/aggregator/services/aggregators.service';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { DspCode } from 'src/modules/dsp/enum/dsp.enum';
import {
	ErnInput,
	ErnVersion,
	ManifestInput,
} from 'src/modules/ern/interfaces/ern-input.interface';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import {
	genBatchId,
	removeFolder,
	resizeCoverImageTo3000x3000,
} from 'src/utils/util';
import { Repository } from 'typeorm';
import { Release } from '../entities/release.entity';
import { ErnService } from '../../ern/services/ern.service';
import { ReleaseQueryService } from './release.query.service';
import { GENRE_MAPPING } from '../../distribution/file-metadata/ci/const';

interface AudioFileInfo {
	buffer: Buffer;
	extension: string;
	isrc: string;
	trackNo: number;
}

interface CoverImageInfo {
	buffer: Buffer;
	extension: string;
}

@Injectable()
export class ReleaseDdexService {
	private readonly logger = new Logger(ReleaseDdexService.name);

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseQuery: ReleaseQueryService,
		private readonly bucket2Sv: BucketService2,
		private readonly appConfigSv: AppConfigService,

		private readonly ernService: ErnService,

		private readonly sftpConnectService: SftpConnectService,
		private readonly dspRoutingConfigsService: DspRoutingConfigsService,
		private readonly countryService: CountryService,
		private readonly aggregatorsService: AggregatorsService,
	) {}

	/**
	 * Main entry point - tạo metadata Spotify trên server
	 */
	async createMetadataOnServer({
		releaseId,
		ernVersion,
		recipient,
		sender,
	}: {
		releaseId: string;
		ernVersion: ErnVersion;
		sender: {
			partyId: string;
			name: string;
		};
		recipient: {
			partyId: string;
			name: string;
		};
	}) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);

		const batchId = genBatchId();

		const upc = release.upc ?? 'new_upc';
		if (!upc) {
			throw new Error('Không tìm thấy mã UPC của release');
		}

		// 1. Setup folder structure
		// release_parsed/20251120151606392/00850080651001/
		const baseDir =
			process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');

		const outputRoot = path.join(baseDir, batchId);
		// const outputRoot = path.resolve('release_parsed', batchId);
		const releaseDir = path.join(outputRoot, upc);
		const resourcesDir = path.join(releaseDir, 'resources');

		fs.mkdirSync(resourcesDir, { recursive: true });

		// 2. Fetch files from bucket
		const { audioFiles, coverImage } =
			await this.fetchAudioAndImageReleaseFromBucket(release);

		// 3. Process and save cover image
		await this.processCoverImage({
			coverImage,
			outputDir: resourcesDir,
			upc,
		});

		// 4. Process and save audio files
		this.processAudioFiles({ audioFiles, outputDir: resourcesDir });

		// 5. DDEX file
		await this.createErnFile({
			releaseId,
			outputDir: releaseDir,
			ernVersion,
			recipient,
			sender,
		});

		this.createManifestFile({
			batchId,
			upc,
			outputRoot,
			recipient,
		});

		await this.releaseRepo.update(releaseId, {
			directDdexOnServer: outputRoot.replace(/\\/g, '/'),
		});

		this.logger.log({
			releaseId,
			step: 'createMetadataOnServer',
			message: `[ABS_PATH] ${path.resolve(releaseDir)}`,
		});

		return {
			outputDir: outputRoot,
			outputRoot,
		};
	}

	async createErnFile({
		releaseId,
		outputDir,
		ernVersion,
		sender,
		recipient,
	}: {
		releaseId: string;
		outputDir: string;
		ernVersion: ErnVersion;
		sender: {
			partyId: string;
			name: string;
		};
		recipient: {
			partyId: string;
			name: string;
		};
	}) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);
		const input: ErnInput = this.parseErnInputFromRelease({
			release,
			ernVersion,
			sender,
			recipient,
		});
		const xmlContent = this.ernService.generate(input);

		const mainXmlPath = path.join(outputDir, `${release.upc}.xml`);
		fs.writeFileSync(mainXmlPath, xmlContent, 'utf-8');
	}

	createManifestFile({
		batchId,
		upc,
		outputRoot,
		recipient,
	}: {
		batchId: string;
		upc: string;
		outputRoot: string;

		recipient: {
			partyId: string;
			name: string;
		};
	}) {
		const xmlFilePath = path.join(outputRoot, upc, `${upc}.xml`);
		const hash = this.getSha1Base64(xmlFilePath);

		const manifest: ManifestInput = {
			sender: {
				partyId: this.appConfigSv.DDEX_PARTY_ID_AMG(),
				name: this.appConfigSv.DDEX_PARTY_NAME_AMG(),
			},

			recipient,

			messages: [
				{
					messageId: batchId,

					url: `./${upc}/${upc}.xml`,

					releaseId: {
						icpn: upc,
						proprietaryId: {
							namespace: this.appConfigSv.DDEX_PARTY_ID_AMG(),
							value: upc,
						},
					},

					deliveryType: 'NewReleaseDelivery',
					productType: 'AudioProduct',

					hashSum: {
						value: hash,
						algorithm: 'SHA1',
					},
				},
			],
		};

		const xml = this.ernService.generateManifest(manifest);

		const manifestPath = path.join(
			outputRoot,
			`BatchComplete_${batchId}.xml`,
		);

		fs.writeFileSync(manifestPath, xml, 'utf-8');

		this.logger.log(`[MANIFEST_CREATED] ${manifestPath}`);
	}

	async uploadMetadataDdexSpotifyToSftp(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);
		try {
			const sftp =
				await this.dspRoutingConfigsService.resolveSftpMetadataByDspCode(
					DspCode.SPOTIFY,
				);

			await this.sftpConnectService.uploadFolderScp({
				sftp,
				localDir: release.directDdexOnServer ?? '',
				remoteDir: sftp.path ?? '/',
			});
		} catch (error) {
			throw new Error(error);
		} finally {
			await removeFolder(release.directDdexOnServer ?? '');
		}
	}

	async uploadMetadataDdexCiToSftp(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);
		try {
			const sftp =
				await this.aggregatorsService.resolveSftpAggregatorCode({
					aggregatorCode: AggregatorCode.CI,
				});

			await this.sftpConnectService.uploadFolderScp({
				sftp,
				localDir: release.directDdexOnServer ?? '',
				remoteDir: sftp.path ?? '/',
			});

			if (release.directDdexOnServer) {
				const batchId = path.basename(release.directDdexOnServer);
				await this.createDoneFolderOnSftp(sftp, batchId);
			}
		} catch (error: any) {
			throw new Error(error.message || String(error));
		} finally {
			// await removeFolder(release.directDdexOnServer ?? '');
		}
	}

	private async createDoneFolderOnSftp(sftp: any, batchId: string) {
		const client = await this.sftpConnectService.connect(sftp);
		try {
			const donePath = path.posix.join(sftp.path ?? '/', `${batchId}.done`);
			await client.mkdir(donePath, true);
			this.logger.log(`[CI_DONE_FOLDER_CREATED] ${donePath}`);
		} catch (err: any) {
			this.logger.error(`Failed to create .done folder: ${err.message}`);
		} finally {
			await client.end();
		}
	}

	// ==================== FILE PROCESSING ====================

	/**
	 * Fetch audio and image files from bucket
	 */
	private async fetchAudioAndImageReleaseFromBucket(
		release: Release,
	): Promise<{
		audioFiles: AudioFileInfo[];
		coverImage: CoverImageInfo;
	}> {
		const audioFiles: AudioFileInfo[] = [];
		const tracks = [...release.tracks].sort((a, b) => a.order - b.order);
		const releaseId = release.id;

		// Fetch audio files
		for (const [index, track] of tracks.entries()) {
			if (!track.audioFile) {
				continue;
			}

			const { fileBuffer, fileDb } = await this.bucket2Sv.getFileBuffer(
				track.audioFile.fileId,
			);

			audioFiles.push({
				buffer: fileBuffer,
				extension: fileDb.extension,
				isrc: track.isrc || `TEMP${String(index + 1).padStart(4, '0')}`,
				trackNo: index + 1,
			});
		}

		// Fetch cover image
		const coverArt = release.releaseCoverArts?.find(
			(art) => art.type === 'original',
		);

		if (!coverArt) {
			throw new Error('Bản phát hành không có ảnh bìa gốc (original cover)');
		}

		const { fileBuffer: coverBuffer, fileDb: coverDb } =
			await this.bucket2Sv.getFileBuffer(coverArt.fileId);

		return {
			audioFiles,
			coverImage: {
				buffer: coverBuffer,
				extension: coverDb.extension,
			},
		};
	}

	/**
	 * Process cover image - resize and save to resources folder
	 * Format: resources/{UPC}.jpg
	 */
	private async processCoverImage({
		coverImage,
		outputDir,
		upc,
	}: {
		coverImage: CoverImageInfo;
		outputDir: string;
		upc: string;
	}): Promise<void> {
		const img = await resizeCoverImageTo3000x3000({
			buffer: coverImage.buffer,
		});

		const ext = this.normalizeImageExtension(coverImage.extension);
		const fileName = `${upc}${ext}`;
		const outputPath = path.join(outputDir, fileName);

		await img.toFile(outputPath);

		// this.logger.log(`[COVER_SAVED] ${fileName}`);
	}

	/**
	 * Process audio files - save to resources folder
	 * Format: resources/{ISRC}_T{trackNo}S.{ext}
	 * Example: resources/QT6KL2500010_T1S.wav
	 */
	private processAudioFiles({
		audioFiles,
		outputDir,
	}: {
		audioFiles: AudioFileInfo[];
		outputDir: string;
	}) {
		for (const audio of audioFiles) {
			const ext = this.normalizeAudioExtension(audio.extension);
			const trackNoStr = String(audio.trackNo).padStart(1, '0'); // T1S, T2S, ...
			const fileName = `${audio.isrc}_T${trackNoStr}S${ext}`;
			const filePath = path.join(outputDir, fileName);

			fs.writeFileSync(filePath, audio.buffer);
			this.logger.log(`[AUDIO_SAVED] ${fileName}`);
		}
	}

	// ==================== DDEX DATA PARSING ====================

	/**
	 * Parse Release entity sang DDEXData structure
	 */

	private parseErnInputFromRelease({
		release,
		ernVersion,
		sender,
		recipient,
	}: {
		release: Release;
		ernVersion: ErnVersion;
		sender: {
			partyId: string;
			name: string;
		};
		recipient: {
			partyId: string;
			name: string;
		};
	}): ErnInput {
		const normalizeParentalWarning = (code?: string) => {
			switch (code) {
				case 'Explicit':
				case 'ExplicitContentEdited':
				case 'NoAdviceAvailable':
				case 'NotExplicit':
				case 'Unknown':
				case 'UserDefined':
					return code;
				default:
					return 'NotExplicit';
			}
		};

		const parentalWarning = release.tracks.some((track) =>
			['Explicit', 'ExplicitContentEdited'].includes(
				normalizeParentalWarning(track.trackSensitive?.code),
			),
		)
			? 'Explicit'
			: 'NotExplicit';

		const cover = release.releaseCoverArts?.[0];
		const coverExt = cover ? this.normalizeImageExtension(cover.file?.extension ?? 'jpg') : '.jpg';

		const territories = this.getTerritoriesFromRelease(release);

		const result: ErnInput = {
			version: ernVersion,

			message: {
				id: release.upc ?? release.id,

				sender,

				recipient,
			},

			release: {
				upc: release.upc ?? '',
				title: release.title ?? '',
				version: release.version ?? undefined,

				type: release.albumFormat?.code ?? 'Album',

				releaseDate: release.releaseDate
					? this.formatDateTime(release.releaseDate)
					: '',

				genre:
					(release.primaryGenre?.name
						? GENRE_MAPPING[release.primaryGenre.name]
						: undefined) ??
					release.primaryGenre?.name ??
					'Pop',
				subGenre:
					(release.subGenre?.name
						? GENRE_MAPPING[release.subGenre.name]
						: undefined) ??
					release.subGenre?.name ??
					undefined,

				labelName: release.label?.name ?? '',

				catalogNumber: release.catalogId ?? undefined,

				artists: release.releaseArtists.map((ra) => ({
					name: ra.artist?.name ?? '',
					role: 'MainArtist',
					spotifyId: ra.artist.spotifyId,
					appleMusicId: ra.artist.appleMusicId,
				})),

				parentalWarning,

				pLine:
					release.pLineYear && release.pLineOwner
						? {
								year: release.pLineYear,
								text: `${release.pLineYear} ${release.pLineOwner}`,
							}
						: undefined,

				cLine:
					release.cLineYear && release.cLineOwner
						? {
								year: release.cLineYear,
								text: `${release.cLineYear} ${release.cLineOwner}`,
							}
						: undefined,

				territories,

				coverArt: cover
					? {
							fileName: `${release.upc}${coverExt}`,
							filePath: 'resources',
							codecType: 'image/jpeg',
							width: cover.width,
							height: cover.height,
						}
					: undefined,
			},

			tracks: [...release.tracks]
				.sort((a, b) => a.order - b.order)
				.map((track) => ({
					isrc: track.isrc ?? '',

					title: track.title ?? '',

					version: track.version ?? undefined,

					duration: this.convertDurationToISO8601(
						track.audioFile?.duration ?? 0,
					),

					order: track.order,

					price: {
						priceType: 'StandardRetailPrice',
						value: track.priceTier?.amount ?? 0,
						currencyCode: track.priceTier?.currency.code ?? '',
					},

					genre:
						(track.primaryGenre?.name
							? GENRE_MAPPING[track.primaryGenre.name]
							: undefined) ??
						track.primaryGenre?.name ??
						(release.primaryGenre?.name
							? GENRE_MAPPING[release.primaryGenre.name]
							: undefined) ??
						release.primaryGenre?.name ??
						undefined,

					subGenre:
						(track.subGenre?.name
							? GENRE_MAPPING[track.subGenre.name]
							: undefined) ??
						track.subGenre?.name ??
						undefined,

					languageOfPerformance:
						track.trackLanguage?.audioLanguage?.code ?? undefined,

					parentalWarning: normalizeParentalWarning(
						track.trackSensitive?.code,
					),

					artists: track.trackArtists.map((ta) => ({
						name: ta.artist?.name ?? '',
						role: 'MainArtist',
					})),

					contributors: track.trackContributors?.map((c) => ({
						name: c.artist?.name ?? '',
						role: c.artistRole?.code ?? '',
					})),

					pLine:
						track.pLineYear && track.pLineOwner
							? {
									year: track.pLineYear,
									text: `${track.pLineYear} ${track.pLineOwner}`,
								}
							: undefined,

					recordingMode: 'Stereo',

					audioFile: track.audioFile
						? {
								fileName: `${track.isrc}_T${track.order}S${this.normalizeAudioExtension(track.audioFile.file?.extension ?? 'wav')}`,

								filePath: 'resources',

								codecType:
									track.audioFile.file?.extension.toUpperCase() ??
									'WAV',

								bitRate: track.audioFile.bitrate ?? undefined,

								samplingRate: track.audioFile.sampleRate
									? parseInt(
											track.audioFile.sampleRate.replace(
												/[^0-9]/g,
												'',
											),
										)
									: undefined,

								bitDepth: track.audioFile.bitDepth ?? undefined,
							}
						: undefined,
				})),

			deals: [
				{
					territories,

					startDate: release.releaseDate
						? this.formatDateTime(release.releaseDate)
						: '',

					commercialModels: [
						'SubscriptionModel',
						'AdvertisementSupportedModel',
					],

					useTypes: ['OnDemandStream', 'ConditionalDownload'],
				},
			],
		};

		return result;
	}

	/**
	 * Get territories from release
	 */
	private getTerritoriesFromRelease(release: Release): string[] {
		const territory = release.releaseTerritory;

		// 1. Không có config → Worldwide
		if (!territory) {
			return ['Worldwide'];
		}

		// 2. Phân phối toàn cầu
		if (territory.distributeWorldwide) {
			return ['Worldwide'];
		}

		const selectedCountries = territory.selectedCountries ?? [];

		switch (territory.distributionType) {
			case DistributionType.DISTRIBUTE_ONLY_IN:
				// Chỉ phân phối ở các nước này
				return selectedCountries.length > 0
					? selectedCountries
					: ['Worldwide'];

			case DistributionType.DISTRIBUTE_EVERYWHERE_EXCEPT: {
				// Giả lập full list territories
				const allCountries = this.countryService.getListSimpleCache();

				const allTerritories: string[] = allCountries.map(
					(c) => c.iso2,
				); // TODO: sau này thay bằng full ISO list

				// Trừ đi các nước bị exclude
				const excluded = new Set(selectedCountries);

				return allTerritories.filter((code) => !excluded.has(code));
			}

			default:
				return ['Worldwide'];
		}
	}

	/**
	 * Convert duration (seconds) to ISO 8601 format
	 * Example: 196 -> PT0H3M16S
	 */
	private convertDurationToISO8601(durationInSeconds: number): string {
		const hours = Math.floor(durationInSeconds / 3600);
		const minutes = Math.floor((durationInSeconds % 3600) / 60);
		const seconds = Math.floor(durationInSeconds % 60);

		return `PT${hours}H${minutes}M${seconds}S`;
	}

	/**
	 * Format date to YYYY-MM-DD
	 */
	private formatDateTime(date: Date | null): string {
		if (!date) {
			return new Date().toISOString().split('T')[0];
		}

		const d = new Date(date);
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');

		return `${year}-${month}-${day}`;
	}

	/**
	 * Normalize image extension to valid formats
	 */
	private normalizeImageExtension(ext: string): string {
		const normalized = ext.toLowerCase().replace(/^\./, '');
		const valid = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff'];

		if (valid.includes(normalized)) {
			return `.${normalized === 'jpeg' ? 'jpg' : normalized}`;
		}

		return '.jpg'; // Default
	}

	/**
	 * Normalize audio extension
	 */
	private normalizeAudioExtension(ext: string): string {
		const normalized = ext.toLowerCase().replace(/^\./, '');
		return `.${normalized}`;
	}

	private getSha1Base64(filePath: string): string {
		const buffer = fs.readFileSync(filePath);

		return crypto.createHash('sha1').update(buffer).digest('base64');
	}
}
