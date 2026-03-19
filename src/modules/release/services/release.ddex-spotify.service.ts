import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';

import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { CountryService } from 'src/modules/country/services/country.service';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { DspService } from 'src/modules/dsp/services/dsp.service';
import {
	ErnInput,
	ManifestInput,
} from 'src/modules/ern/interfaces/ern-input.interface';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import {
	genBatchId,
	removeFolder,
	resizeCoverImageTo3000x3000,
} from 'src/utils/util';
import { Repository } from 'typeorm';
import { BucketService } from '../../bucket/services/bucket.service';
import { Release } from '../entities/release.entity';
import { ErnService } from './../../ern/ern.service';
import { ReleaseQueryService } from './release.query.service';

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
export class ReleaseDdexSpotifyService implements OnModuleInit {
	private readonly logger = new Logger(ReleaseDdexSpotifyService.name);

	// Spotify DPID (Party ID)
	private DDEX_PARTY_ID_SPOTIFY: string;
	private DDEX_PARTY_NAME_SPOTIFY: string;

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseQuery: ReleaseQueryService,
		private readonly bucketSv: BucketService,
		private readonly appConfigSv: AppConfigService,
		private readonly dspSv: DspService,

		private readonly ernService: ErnService,

		private readonly sftpConnectService: SftpConnectService,
		private readonly dspRoutingConfigsService: DspRoutingConfigsService,
		private readonly countryService: CountryService,
	) {}

	async createErnFile({
		releaseId,
		outputDir,
	}: {
		releaseId: string;
		outputDir: string;
	}) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);
		const input: ErnInput = this.parseErnInputFromRelease(release);
		const xmlContent = this.ernService.generate(input);

		const mainXmlPath = path.join(outputDir, `${release.upc}.xml`);
		fs.writeFileSync(mainXmlPath, xmlContent, 'utf-8');
		this.logger.log(`[XML_CREATED] ${mainXmlPath}`);
	}

	/**
	 * Main entry point - tạo metadata Spotify trên server
	 */
	async createMetadataSpotifyOnServer(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);

		const batchId = genBatchId();

		this.logger.log(`[ERN_SPOTIFY] Starting batch: ${batchId}`);

		const upc = release.upc ?? 'new_upc';
		if (!upc) {
			throw new Error('Release missing UPC');
		}

		// 1. Setup folder structure
		// release_parsed/20251120151606392/00850080651001/
		const outputRoot = path.resolve('release_parsed', batchId);
		const releaseDir = path.join(outputRoot, upc);
		const resourcesDir = path.join(releaseDir, 'resources');

		fs.mkdirSync(resourcesDir, { recursive: true });
		this.logger.log(`[FOLDER_CREATED] ${releaseDir}`);

		// 2. Fetch files from GCS
		const { audioFiles, coverImage } =
			await this.fetchAudioAndImageReleaseFromGCS(release);

		// 3. Process and save cover image
		await this.processCoverImageSpotify({
			coverImage,
			outputDir: resourcesDir,
			upc,
		});

		// 4. Process and save audio files
		this.processAudioFilesSpotify({ audioFiles, outputDir: resourcesDir });

		// 5. DDEX file
		// await this.createDdexFile({ releaseId, outputDir: releaseDir });
		await this.createErnFile({ releaseId, outputDir: releaseDir });

		this.createManifestFile({
			batchId,
			upc,
			outputRoot,
		});
		// this.createBatchCompleteFile({ batchId, upc, outputDir: outputRoot });

		await this.releaseRepo.update(releaseId, {
			metadataSpotify: {
				...release.metadataSpotify,
				folderServer: outputRoot.replace(/\\/g, '/'),
				// batchId,
			},
		});

		this.logger.log(`[COMPLETED] Batch ${batchId} - ${upc}`);

		return {
			outputDir: outputRoot,
			outputRoot,
		};
	}

	createManifestFile({
		batchId,
		upc,
		outputRoot,
	}: {
		batchId: string;
		upc: string;
		outputRoot: string;
	}) {
		const manifest: ManifestInput = {
			sender: {
				partyId: this.appConfigSv.DDEX_PARTY_ID_SENDER(),
				name: this.appConfigSv.DDEX_PARTY_NAME_SENDER(),
			},

			recipient: {
				partyId: this.DDEX_PARTY_ID_SPOTIFY,
				name: this.DDEX_PARTY_NAME_SPOTIFY,
			},

			messages: [
				{
					messageId: '00001',

					url: `./${upc}/${upc}.xml`,

					releaseId: {
						icpn: upc,
						proprietaryId: {
							namespace: this.appConfigSv.DDEX_PARTY_ID_SENDER(),
							value: upc,
						},
					},

					deliveryType: 'NewReleaseDelivery',
					productType: 'AudioProduct',

					hashSum: {
						value: 'TEMP_HASH',
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

	async uploadMetadataSpotifyToSftp(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFull(releaseId);

		const sftp =
			await this.dspRoutingConfigsService.resolveSftpMetadataByDspCode(
				'SPOTIFY',
			);

		await this.sftpConnectService.uploadFolderScp({
			sftp,
			localDir: release.metadataSpotify?.folderServer ?? '',
			remoteDir: sftp.path ?? '/',
		});

		await removeFolder(release.metadataSpotify?.folderServer ?? '');
	}

	@OnEvent(AppEvent.UPDATE_DDEX_PARTY)
	async handleDdexPartyUpdated() {
		await this.reloadConfig();
	}

	async onModuleInit() {
		await this.reloadConfig();
	}

	private async reloadConfig() {
		const { ddexId, ddexName } = await this.dspSv.getDdexPartySpotify();

		this.DDEX_PARTY_ID_SPOTIFY = ddexId;
		this.DDEX_PARTY_NAME_SPOTIFY = ddexName;
	}

	// ==================== FILE PROCESSING ====================

	/**
	 * Fetch audio and image files from GCS
	 */
	private async fetchAudioAndImageReleaseFromGCS(release: Release): Promise<{
		audioFiles: AudioFileInfo[];
		coverImage: CoverImageInfo;
	}> {
		const audioFiles: AudioFileInfo[] = [];
		const tracks = [...release.tracks].sort((a, b) => a.order - b.order);

		// Fetch audio files
		for (const [index, track] of tracks.entries()) {
			if (!track.audioFile) {
				this.logger.warn(`Track ${track.order} has no audio file`);
				continue;
			}

			const { fileBuffer, fileDb } = await this.bucketSv.getFileBuffer(
				track.audioFile.fileId,
			);

			audioFiles.push({
				buffer: fileBuffer,
				extension: fileDb.extension,
				isrc: track.isrc || `TEMP${String(index + 1).padStart(4, '0')}`,
				trackNo: index + 1,
			});

			this.logger.log(
				`[AUDIO_FETCHED] Track ${index + 1}: ${track.isrc || 'NO_ISRC'}`,
			);
		}

		// Fetch cover image
		const coverArt = release.releaseCoverArts?.find(
			(art) => art.type === 'original',
		);

		if (!coverArt) {
			throw new Error('Release has no original cover image');
		}

		const { fileBuffer: coverBuffer, fileDb: coverDb } =
			await this.bucketSv.getFileBuffer(coverArt.fileId);

		this.logger.log(`[COVER_FETCHED] ${coverDb.extension}`);

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
	private async processCoverImageSpotify({
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
		this.logger.log(`[COVER_SAVED] ${fileName}`);
	}

	/**
	 * Process audio files - save to resources folder
	 * Format: resources/{ISRC}_T{trackNo}S.{ext}
	 * Example: resources/QT6KL2500010_T1S.wav
	 */
	private processAudioFilesSpotify({
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

	private parseErnInputFromRelease(release: Release): ErnInput {
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

		const territories = this.getTerritoriesFromRelease(release);

		return {
			version: '4.3',

			message: {
				id: release.upc ?? release.id,

				sender: {
					partyId: this.appConfigSv.DDEX_PARTY_ID_SENDER(),
					name: this.appConfigSv.DDEX_PARTY_NAME_SENDER(),
				},

				recipient: {
					partyId: this.DDEX_PARTY_ID_SPOTIFY,
					name: this.DDEX_PARTY_NAME_SPOTIFY,
				},
			},

			release: {
				upc: release.upc ?? '',
				title: release.title ?? '',
				version: release.version ?? undefined,

				type: release.albumFormat?.code ?? 'ALBUM',

				releaseDate: release.releaseDate
					? this.formatDateTime(release.releaseDate)
					: '',

				genre: release.primaryGenre?.name ?? 'Pop',
				subGenre: release.subGenre?.name ?? undefined,

				labelName: release.label?.name ?? '',

				catalogNumber: release.catalogId ?? undefined,

				artists: release.releaseArtists.map((ra) => ({
					name: ra.artist?.name ?? '',
					role: 'MainArtist',
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
							fileName: cover.file?.fileName ?? '',
							filePath: cover.file?.key ?? '',
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

					genre:
						track.primaryGenre?.name ??
						release.primaryGenre?.name ??
						undefined,

					subGenre: track.subGenre?.name ?? undefined,

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
								fileName: track.audioFile.file?.fileName,

								filePath: track.audioFile.file?.key,

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
}
