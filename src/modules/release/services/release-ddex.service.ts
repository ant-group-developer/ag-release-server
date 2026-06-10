import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { CountryService } from 'src/modules/country/services/country.service';
import { AggregatorCode } from 'src/modules/distribution/aggregator/enum/distribution.enum';
import { AggregatorsService } from 'src/modules/distribution/aggregator/services/aggregators.service';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { DspCode } from 'src/modules/dsp/enum/dsp.enum';

import { NO_LINGUISTIC_CONTENT_LANGUAGE } from 'src/common/constants/common.default.constants';
import {
	ErnInput2,
	ErnVersion2,
	ManifestInput2,
} from 'src/modules/ern2/interfaces/ern-input.interface';
import { ErnService2 } from 'src/modules/ern2/services/ern.service';
import { ReleaseCaptionType } from 'src/modules/release-caption/entities/release-caption.entity';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import {
	genBatchId,
	removeFolder,
	resizeCoverImageTo3000x3000,
} from 'src/utils/util';
import { GENRE_MAPPING } from '../../distribution/file-metadata/ci/const';
import { Release } from '../entities/release.entity';

interface AudioFileInfo {
	// buffer: Buffer;
	filePath: string;
	extension: string;
	isrc: string;
	trackNo: number;
}

interface CoverImageInfo {
	// buffer: Buffer;
	filePath: string;
	extension: string;
}

@Injectable()
export class ReleaseDdexService {
	private readonly logger = new Logger(ReleaseDdexService.name);

	constructor(
		private readonly bucket2Sv: BucketService2,

		private readonly ernService2: ErnService2,

		private readonly sftpConnectService: SftpConnectService,
		private readonly dspRoutingConfigsService: DspRoutingConfigsService,
		private readonly countryService: CountryService,
		private readonly aggregatorsService: AggregatorsService,
	) {}

	/**
	 * Main entry point - tạo metadata Spotify trên server
	 */
	async createMetadataOnServer({
		release,
		ernVersion,
		recipient,
		sender,
		dspCode,
	}: {
		release: Release;
		ernVersion: ErnVersion2;
		sender: { partyId: string; name: string };
		recipient: { partyId: string; name: string };
		dspCode?: string;
	}) {
		const batchId = genBatchId();

		const upc = release.upc ?? 'new_upc';
		if (!upc) {
			throw new Error('Không tìm thấy mã UPC của release');
		}

		const baseDir =
			process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
		const outputRoot = path.join(baseDir, batchId);
		const releaseDir = path.join(outputRoot, upc);
		const resourcesDir = path.join(releaseDir, 'resources');

		fs.mkdirSync(resourcesDir, { recursive: true });

		// Tạo tempDir riêng để chứa file tải từ bucket
		// Sẽ bị xóa trong finally dù thành công hay lỗi
		const tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), `release-${release.id}-${Date.now()}-`),
		);

		try {
			if (release.type === 'video') {
				const { videoFile, subtitleFiles, coverImage } =
					await this.fetchVideoAndImageReleaseFromBucket(
						release,
						tempDir,
					);

				await this.processCoverImage({
					coverImage,
					outputDir: resourcesDir,
					upc,
				});

				await this.processVideoAndSubtitleFiles({
					videoFile,
					subtitleFiles,
					outputDir: resourcesDir,
					isrc: release.video!.isrc ?? '',
				});
			} else {
				const { audioFiles, coverImage } =
					await this.fetchAudioAndImageReleaseFromBucket(
						release,
						tempDir,
					);

				await this.processCoverImage({
					coverImage,
					outputDir: resourcesDir,
					upc,
				});

				await this.processAudioFiles({
					audioFiles,
					outputDir: resourcesDir,
				});
			}

			const xml = this.createErnFile({
				release,
				outputDir: releaseDir,
				ernVersion,
				recipient,
				sender,
			});

			if (dspCode?.toUpperCase() !== 'VEVO') {
				this.createManifestFile({
					batchId,
					upc,
					outputRoot,
					sender,
					recipient,
				});
			}

			this.logger.log({
				releaseId: release.id,
				step: 'createMetadataOnServer',
				message: `[ABS_PATH] ${path.resolve(releaseDir)}`,
			});

			return { outputDir: outputRoot, outputRoot, batchId, xml };
		} finally {
			// Xóa file tạm dù thành công hay throw
			// await fs.promises.rm(tempDir, { recursive: true, force: true });
		}
	}

	createErnFile({
		release,
		outputDir,
		ernVersion,
		sender,
		recipient,
	}: {
		release: Release;
		outputDir: string;
		ernVersion: ErnVersion2;
		sender: {
			partyId: string;
			name: string;
		};
		recipient: {
			partyId: string;
			name: string;
		};
	}) {
		const input: ErnInput2 = this.parseErnInputFromRelease({
			release,
			ernVersion,
			sender,
			recipient,
		});
		const xmlContent = this.ernService2.generate(input);

		const mainXmlPath = path.join(outputDir, `${release.upc}.xml`);
		fs.writeFileSync(mainXmlPath, xmlContent, 'utf-8');

		return xmlContent;
	}

	async generateReleaseXml(
		release: Release,
		dspCode: string,
		ernVersion?: ErnVersion2,
	): Promise<string> {
		const config =
			await this.dspRoutingConfigsService.resolveFullDeliveryConfig(
				dspCode,
			);

		const input: ErnInput2 = this.parseErnInputFromRelease({
			release,
			ernVersion: ernVersion || config.ernVersion,
			sender: config.sender,
			recipient: config.recipient,
		});

		return this.ernService2.generate(input);
	}

	createManifestFile({
		batchId,
		upc,
		outputRoot,
		sender,
		recipient,
	}: {
		batchId: string;
		upc: string;
		outputRoot: string;

		sender: {
			partyId: string;
			name: string;
		};
		recipient: {
			partyId: string;
			name: string;
		};
	}) {
		const xmlFilePath = path.join(outputRoot, upc, `${upc}.xml`);
		const hash = this.getSha1Base64(xmlFilePath);

		const manifest: ManifestInput2 = {
			sender,

			recipient,

			messages: [
				{
					messageId: batchId,

					url: `./${upc}/${upc}.xml`,

					releaseId: {
						icpn: upc,
						proprietaryId: {
							namespace: sender.partyId,
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

		const xml = this.ernService2.generateManifest(manifest);

		const manifestPath = path.join(
			outputRoot,
			`BatchComplete_${batchId}.xml`,
		);

		fs.writeFileSync(manifestPath, xml, 'utf-8');

		this.logger.log(`[MANIFEST_CREATED] ${manifestPath}`);

		return xml;
	}

	async uploadMetadataDdexSpotifyToSftp(release: Release) {
		try {
			const sftp =
				await this.dspRoutingConfigsService.resolveSftpMetadataByDspCode(
					DspCode.SPOTIFY,
				);

			await this.sftpConnectService.uploadFolder({
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

	async uploadMetadataDdexCiToSftp(release: Release) {
		try {
			const sftp =
				await this.aggregatorsService.resolveSftpAggregatorCode({
					aggregatorCode: AggregatorCode.CI,
				});

			await this.sftpConnectService.uploadFolder({
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
			await removeFolder(release.directDdexOnServer ?? '');
		}
	}

	private async createDoneFolderOnSftp(sftp: any, batchId: string) {
		const client = await this.sftpConnectService.connect(sftp);
		try {
			const donePath = path.posix.join(
				sftp.path ?? '/',
				`${batchId}.done`,
			);
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
	// private async fetchAudioAndImageReleaseFromBucket(
	// 	release: Release,
	// ): Promise<{
	// 	audioFiles: AudioFileInfo[];
	// 	coverImage: CoverImageInfo;
	// }> {
	// 	const tracks = [...release.tracks].sort((a, b) => a.order - b.order);

	// 	// Fetch audio files
	// 	const tracksWithAudio = tracks.filter(
	// 		(
	// 			track,
	// 		): track is typeof track & {
	// 			audioFile: NonNullable<typeof track.audioFile>;
	// 		} => !!track.audioFile,
	// 	);
	// 	const fileIds = tracksWithAudio.map((track) => track.audioFile.fileId);
	// 	const fileBuffers = await this.bucket2Sv.getListFileBuffers(fileIds);

	// 	// Map theo fileId để tránh lệch thứ tự
	// 	const fileBufferMap = new Map(
	// 		fileBuffers.map((item) => [item.fileDb.id, item]),
	// 	);

	// 	const audioFiles = tracksWithAudio.map((track, index) => {
	// 		const originalIndex = tracks.indexOf(track);
	// 		const { fileBuffer, fileDb } = fileBufferMap.get(
	// 			track.audioFile.fileId,
	// 		)!;
	// 		return {
	// 			buffer: fileBuffer,
	// 			extension: fileDb.extension,
	// 			isrc:
	// 				track.isrc ||
	// 				`TEMP${String(originalIndex + 1).padStart(4, '0')}`,
	// 			trackNo: originalIndex + 1,
	// 		};
	// 	});

	// 	// Fetch cover image
	// 	const coverArt = release.releaseCoverArts?.find(
	// 		(art) => art.type === 'original',
	// 	);

	// 	if (!coverArt) {
	// 		throw new Error(
	// 			'Bản phát hành không có ảnh bìa gốc (original cover)',
	// 		);
	// 	}

	// 	const { fileBuffer: coverBuffer, fileDb: coverDb } =
	// 		await this.bucket2Sv.getFileBuffer(coverArt.fileId);

	// 	return {
	// 		audioFiles,
	// 		coverImage: {
	// 			buffer: coverBuffer,
	// 			extension: coverDb.extension,
	// 		},
	// 	};
	// }

	private async fetchAudioAndImageReleaseFromBucket(
		release: Release,
		tempDir: string,
	): Promise<{
		audioFiles: AudioFileInfo[];
		coverImage: CoverImageInfo;
	}> {
		const tracks = [...release.tracks].sort((a, b) => a.order - b.order);

		const tracksWithAudio = tracks.filter(
			(
				track,
			): track is typeof track & {
				audioFile: NonNullable<typeof track.audioFile>;
			} => !!track.audioFile,
		);

		const audioFiles: AudioFileInfo[] = [];

		for (const track of tracksWithAudio) {
			const originalIndex = tracks.indexOf(track);
			const destPath = path.join(
				tempDir,
				`track_${String(originalIndex + 1).padStart(3, '0')}.tmp`,
			);

			const fileDb = await this.bucket2Sv.streamFileToPath({
				fileId: track.audioFile.fileId,
				destPath,
			});

			audioFiles.push({
				filePath: destPath,
				extension: fileDb.extension,
				isrc:
					track.isrc ||
					`TEMP${String(originalIndex + 1).padStart(4, '0')}`,
				trackNo: originalIndex + 1,
			});
		}

		const coverArt = release.releaseCoverArts?.find(
			(art) => art.type === 'original',
		);

		if (!coverArt) {
			throw new Error(
				'Bản phát hành không có ảnh bìa gốc (original cover)',
			);
		}

		const coverPath = path.join(tempDir, 'cover.tmp');
		const coverDb = await this.bucket2Sv.streamFileToPath({
			fileId: coverArt.fileId,
			destPath: coverPath,
		});

		return {
			audioFiles,
			coverImage: {
				filePath: coverPath,
				extension: coverDb.extension,
			},
		};
	}

	private async fetchVideoAndImageReleaseFromBucket(
		release: Release,
		tempDir: string,
	): Promise<{
		videoFile: { filePath: string; fileName: string; extension: string };
		subtitleFiles: {
			filePath: string;
			fileName: string;
			extension: string;
			language: string;
			type?: ReleaseCaptionType;
		}[];
		coverImage: CoverImageInfo;
	}> {
		if (!release.video) {
			throw new Error(
				'Release type is video but no video metadata is linked',
			);
		}

		// Fetch Video file
		const videoFileId = release.video.fileId;
		if (!videoFileId) {
			throw new Error('Video record found but has no file associated');
		}
		const videoDestPath = path.join(
			tempDir,
			`video_${release.video.isrc ?? ''}.tmp`,
		);
		const videoFileDb = await this.bucket2Sv.streamFileToPath({
			fileId: videoFileId,
			destPath: videoDestPath,
		});

		// Fetch Cover image (Thumbnail)
		const coverArt = release.releaseCoverArts?.find(
			(art) => art.type === 'original',
		);
		if (!coverArt) {
			throw new Error('Video release has no original cover/thumbnail');
		}
		const coverPath = path.join(tempDir, 'cover.tmp');
		const coverDb = await this.bucket2Sv.streamFileToPath({
			fileId: coverArt.fileId,
			destPath: coverPath,
		});

		// Fetch caption/subtitle files from the release_captions relation.
		const subtitleFiles = [];
		const captions =
			release.captions?.map((caption) => ({
				language: caption.language?.code ?? '',
				fileId: caption.fileId,
				type: caption.type,
				fileName:
					caption.file?.fileName ||
					`${caption.language?.code ?? 'caption'}_${release.video?.isrc ?? ''}.srt`,
			})) ?? [];

		if (captions.length) {
			for (const [subIndex, sub] of captions.entries()) {
				const subDestPath = path.join(
					tempDir,
					`sub_${sub.language}_${subIndex}.tmp`,
				);
				const subFileDb = await this.bucket2Sv.streamFileToPath({
					fileId: sub.fileId,
					destPath: subDestPath,
				});
				subtitleFiles.push({
					filePath: subDestPath,
					fileName: sub.fileName || `sub_${sub.language}.srt`,
					extension: subFileDb.extension,
					language: sub.language,
					type: sub.type,
				});
			}
		}

		return {
			videoFile: {
				filePath: videoDestPath,
				fileName: `${release.video.isrc ?? ''}.mp4`,
				extension: videoFileDb.extension,
			},
			subtitleFiles,
			coverImage: {
				filePath: coverPath,
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
		const buffer = await fs.promises.readFile(coverImage.filePath);
		const img = await resizeCoverImageTo3000x3000({
			buffer,
		});

		const ext = this.normalizeImageExtension(coverImage.extension);
		const fileName = `${upc}${ext}`;
		const outputPath = path.join(outputDir, fileName);

		await img.toFile(outputPath);
	}

	/**
	 * Process audio files - save to resources folder
	 * Format: resources/{ISRC}_T{trackNo}S.{ext}
	 * Example: resources/QT6KL2500010_T1S.wav
	 */
	private async processAudioFiles({
		audioFiles,
		outputDir,
	}: {
		audioFiles: AudioFileInfo[];
		outputDir: string;
	}): Promise<void> {
		for (const [index, audio] of audioFiles.entries()) {
			const ext = this.normalizeAudioExtension(audio.extension);
			const trackNoStr = String(index).padStart(1, '0');
			const fileName = `${audio.isrc}_T${trackNoStr}S${ext}`;
			const destPath = path.join(outputDir, fileName);

			// Rename thay vì copy nếu tempDir và outputDir cùng filesystem
			// (nhanh hơn, không tốn thêm disk I/O)
			await fs.promises
				.rename(audio.filePath, destPath)
				.catch(async () => {
					// Fallback: khác filesystem (tmpfs → disk) thì copy
					await fs.promises.copyFile(audio.filePath, destPath);
				});

			this.logger.log(`[AUDIO_SAVED] ${fileName}`);
		}
	}

	/**
	 * Process video and subtitle files - save to resources folder
	 * Format: resources/{ISRC}_T1V.{ext} for video
	 * Format: resources/{ISRC}_T{index}S.srt for subtitles
	 */
	private async processVideoAndSubtitleFiles({
		videoFile,
		subtitleFiles,
		outputDir,
		isrc,
	}: {
		videoFile: { filePath: string; fileName: string; extension: string };
		subtitleFiles: {
			filePath: string;
			fileName: string;
			extension: string;
			language: string;
			type?: ReleaseCaptionType;
		}[];
		outputDir: string;
		isrc: string;
	}): Promise<void> {
		// 1. Process Video
		const ext = this.normalizeVideoExtension(videoFile.extension);
		const videoFileName = `${isrc}_T1V${ext}`;
		const videoDestPath = path.join(outputDir, videoFileName);
		await fs.promises
			.rename(videoFile.filePath, videoDestPath)
			.catch(async () => {
				await fs.promises.copyFile(videoFile.filePath, videoDestPath);
			});
		this.logger.log(`[VIDEO_SAVED] ${videoFileName}`);

		// 2. Process Subtitles
		for (const [subIndex, sub] of subtitleFiles.entries()) {
			const subFileName = `${isrc}_T${subIndex + 1}S.srt`;
			const subDestPath = path.join(outputDir, subFileName);
			await fs.promises
				.rename(sub.filePath, subDestPath)
				.catch(async () => {
					await fs.promises.copyFile(sub.filePath, subDestPath);
				});
			this.logger.log(`[SUBTITLE_SAVED] ${subFileName}`);
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
		ernVersion: ErnVersion2;
		sender: {
			partyId: string;
			name: string;
		};
		recipient: {
			partyId: string;
			name: string;
		};
	}): ErnInput2 {
		if (release.type === 'video') {
			return this.parseErnInputFromVideo({
				release,
				ernVersion,
				sender,
				recipient,
			});
		}
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
		const coverExt = cover
			? this.normalizeImageExtension(cover.file?.extension ?? 'jpg')
			: '.jpg';

		const territories = this.getTerritoriesFromRelease(release);

		const result: ErnInput2 = {
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
					name:
						ra.artist?.artistProfiles?.find(
							(p) => p.dsp?.code === String(DspCode.SPOTIFY),
						)?.name ??
						ra.artist?.name ??
						'',
					role: 'MainArtist',
					spotifyId: ra.artist?.spotifyId,
					appleMusicId: ra.artist?.appleMusicId,
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
				.map((track, index) => ({
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
						currencyCode: track.priceTier?.currency?.code || 'USD',
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

					...(track.isInstrumental
						? { isInstrumental: true }
						: {
								// No linguistic content:
								// https://service.ddex.net/dd/DD-AVS-002.old/dd/avs_ZXX_Language.html
								languageOfPerformance:
									track.trackLanguage?.audioLanguage?.code ??
									NO_LINGUISTIC_CONTENT_LANGUAGE,
							}),

					parentalWarning: normalizeParentalWarning(
						track.trackSensitive?.code,
					),

					artists: track.trackArtists.map((ta) => ({
						name:
							ta.artist?.artistProfiles?.find(
								(p) => p.dsp?.code === String(DspCode.SPOTIFY),
							)?.name ??
							ta.artist?.name ??
							'',
						role: 'MainArtist',
					})),

					contributors: track.trackContributors?.map((c) => ({
						name:
							c.artist?.artistProfiles?.find(
								(p) => p.dsp?.code === String(DspCode.SPOTIFY),
							)?.name ??
							c.artist?.name ??
							'',
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
								fileName: `${track.isrc}_T${index}S${this.normalizeAudioExtension(track.audioFile.file?.extension ?? 'wav')}`,

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

			deals: {
				release: [
					{
						territories,

						startDate: release.releaseDate
							? this.formatDateTime(release.releaseDate)
							: '',

						endDate: release.releaseEndDate
							? this.formatDateTime(release.releaseEndDate)
							: '',

						commercialModels: ['PayAsYouGoModel'],

						useTypes: ['PermanentDownload'],

						price: {
							priceType: 'StandardRetailPrice',
							value: release.priceTier?.amount ?? 0,
							currencyCode:
								release.priceTier?.currency?.code || 'USD',
						},
					},
				],
				tracks: [
					{
						territories,
						startDate: release.releaseDate
							? this.formatDateTime(release.releaseDate)
							: '',
						endDate: release.releaseEndDate
							? this.formatDateTime(release.releaseEndDate)
							: '',
						commercialModels: ['PayAsYouGoModel'],
						useTypes: ['PermanentDownload'],
						price: {
							priceType: 'StandardRetailPrice',
							value: release.tracks?.[0]?.priceTier?.amount ?? 0,
							currencyCode:
								release.tracks?.[0]?.priceTier?.currency
									?.code || 'USD',
						},
					},
					{
						territories,
						startDate: release.releaseDate
							? this.formatDateTime(release.releaseDate)
							: '',
						endDate: release.releaseEndDate
							? this.formatDateTime(release.releaseEndDate)
							: '',
						commercialModels: ['AdvertisementSupportedModel'],
						useTypes: ['Stream'],
						price: {
							priceType: 'StandardRetailPrice',
							value: release.tracks?.[0]?.priceTier?.amount ?? 0,
							currencyCode:
								release.tracks?.[0]?.priceTier?.currency
									?.code || 'USD',
						},
					},
					{
						territories,
						startDate: release.releaseDate
							? this.formatDateTime(release.releaseDate)
							: '',
						endDate: release.releaseEndDate
							? this.formatDateTime(release.releaseEndDate)
							: '',
						commercialModels: ['SubscriptionModel'],
						useTypes: ['Stream'],
						price: {
							priceType: 'StandardRetailPrice',
							value: release.tracks?.[0]?.priceTier?.amount ?? 0,
							currencyCode:
								release.tracks?.[0]?.priceTier?.currency
									?.code || 'USD',
						},
					},
				],
			},
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

	/**
	 * Normalize video extension
	 */
	private normalizeVideoExtension(ext: string): string {
		const normalized = ext.toLowerCase().replace(/^\./, '');
		return `.${normalized}`;
	}

	private parseErnInputFromVideo({
		release,
		ernVersion,
		sender,
		recipient,
	}: {
		release: Release;
		ernVersion: ErnVersion2;
		sender: { partyId: string; name: string };
		recipient: { partyId: string; name: string };
	}): ErnInput2 {
		const cover = release.releaseCoverArts?.[0];
		const coverExt = cover
			? this.normalizeImageExtension(cover.file?.extension ?? 'jpg')
			: '.jpg';

		const territories = this.getTerritoriesFromRelease(release);

		const video = release.video;
		if (!video) {
			throw new Error('Video metadata not found for video release');
		}

		const artists =
			video.videoArtists?.length > 0
				? video.videoArtists.map((va) => ({
						name: va.artist?.name ?? '',
						role: 'MainArtist',
					}))
				: release.releaseArtists.map((ra) => ({
						name: ra.artist?.name ?? '',
						role: 'MainArtist',
					}));

		const contributors =
			video.videoContributors?.length > 0
				? video.videoContributors.map((c) => ({
						name: c.artist?.name ?? '',
						role: c.artistRole?.code ?? 'Composer',
					}))
				: release.releaseContributors?.map((c) => ({
						name: c.artist?.name ?? '',
						role: c.artistRole?.code ?? 'Composer',
					}));

		const videoIsrc = video.isrc ?? '';
		const videoLabelName =
			video.label?.trim() || release.label?.name || 'label_video';

		return {
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
				type: 'VideoSingle',
				releaseDate: release.releaseDate
					? this.formatDateTime(release.releaseDate)
					: '',
				genre: release.primaryGenre?.name ?? 'Pop',
				subGenre: release.subGenre?.name ?? undefined,
				labelName: videoLabelName,
				artists,
				parentalWarning: video.explicit ? 'Explicit' : 'NotExplicit',
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
			tracks: [],
			videos: [
				{
					isrc: videoIsrc,
					title: release.title ?? '',
					version: release.version ?? undefined,
					duration: 300, // Default duration if not specified
					order: 1,
					genre: release.primaryGenre?.name ?? 'Pop',
					subGenre: release.subGenre?.name ?? undefined,
					parentalWarning: video.explicit
						? 'Explicit'
						: 'NotExplicit',
					artists,
					contributors,
					pLine:
						release.pLineYear && release.pLineOwner
							? {
									year: release.pLineYear,
									text: `${release.pLineYear} ${release.pLineOwner}`,
								}
							: undefined,
					videoFile: {
						fileName: `${videoIsrc}_T1V${this.normalizeVideoExtension(video.videoFile?.extension ?? 'mp4')}`,
						filePath: 'resources',
						codecType: 'MP4',
					},
					subtitles: (
						release.captions?.map((caption) => ({
							language: caption.language?.code ?? '',
							fileId: caption.fileId,
							type: caption.type,
						})) ?? []
					).map((sub, subIdx) => ({
						language: sub.language,
						fileName: `${videoIsrc}_T${subIdx + 1}S.srt`,
						filePath: 'resources',
						type:
							sub.type === ReleaseCaptionType.SUBTITLE
								? 'SubTitle'
								: 'Caption',
					})),
					channel: video.channel?.name ?? undefined,
					languageOfPerformance:
						release.releaseLanguage?.audioLanguage?.code ??
						undefined,
					description: video.description || undefined,
					keywords: video.keywords ?? undefined,
					madeForKids: video.madeForKids ?? undefined,
					visibility: video.visibility ?? undefined,
					partnerCustomId1: video.partnerCustomId1 || undefined,
					partnerCustomId2: video.partnerCustomId2 || undefined,
				},
			],
			deals: {
				release: [
					{
						territories,
						startDate: release.releaseDate
							? this.formatDateTime(release.releaseDate)
							: '',
						endDate: release.releaseEndDate
							? this.formatDateTime(release.releaseEndDate)
							: '',
						commercialModels: [
							'SubscriptionModel',
							'AdvertisementSupportedModel',
						],
						useTypes: ['Stream'],
						price: {
							priceType: 'StandardRetailPrice',
							value: release.priceTier?.amount ?? 0,
							currencyCode:
								release.priceTier?.currency?.code || 'USD',
						},
					},
				],
			},
		};
	}

	private getSha1Base64(filePath: string): string {
		const buffer = fs.readFileSync(filePath);

		return crypto.createHash('sha1').update(buffer).digest('base64');
	}
}
