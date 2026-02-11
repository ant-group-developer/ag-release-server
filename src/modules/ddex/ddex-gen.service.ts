import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Artist } from 'src/modules/artist/entities/artist.entity';

import { Track } from 'src/modules/track/entities/track.entity';
import {
	genBatchId,
	removeFolder,
	resizeCoverImageTo3000x3000,
	uploadFileToSftp,
	zipFolder,
} from 'src/utils/util';
import { Repository } from 'typeorm';
import { BucketService } from '../bucket/services/bucket.service';
import { SftpConfigsService } from '../distribution/sftp-configs/services/sftp-config.service';
import { SftpConnectService } from '../distribution/sftp-connect/sftp-connect.service';
import { Release } from '../release/entities/release.entity';
import { ReleaseQueryService } from '../release/services/release.query.service';
import { ERN43Generator } from './generators/ern43.generator';
import {
	DDEXContributor,
	DDEXData,
	DDEXDeal,
	DDEXDisplayArtist,
	DDEXParty,
	DDEXRelease,
	DDEXResource,
} from './interfaces/ddex-input.interface';

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
export class DdexSpotifyService {
	private readonly logger = new Logger(DdexSpotifyService.name);
	private readonly generator = new ERN43Generator();

	// Spotify DPID (Party ID)
	private readonly SPOTIFY_DPID = 'PADPIDA2011072101T';
	private readonly SPOTIFY_NAME = 'Spotify';

	// Your company DPID
	private readonly SENDER_DPID = 'PADPIDA20250804056';
	private readonly SENDER_NAME = 'ANT MUSIC LLC';

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseQuery: ReleaseQueryService,
		private readonly bucketSv: BucketService,
		private readonly sftpConfigsService: SftpConfigsService,
		private readonly sftpConnectService: SftpConnectService,
	) {}

	/**
	 * Main entry point - tạo metadata Spotify trên server
	 * Tương tự createMetadataSpotifyOnServer của CI
	 */
	async createMetadataSpotifyOnServer(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFullCi(releaseId);

		const batchId = genBatchId();

		this.logger.log(`[DDEX_SPOTIFY] Starting batch: ${batchId}`);

		const upc = release.upc;
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
		await this.processCoverImageSpotify(coverImage, resourcesDir, upc);

		// 4. Process and save audio files
		this.processAudioFilesSpotify(audioFiles, resourcesDir);

		// 5. Parse DB data to DDEX structure
		const ddexData = this.parseDDEXDataFromRelease(release, batchId);

		// 6. Generate main DDEX XML
		const xmlContent = this.generator.generate(ddexData);
		const mainXmlPath = path.join(releaseDir, `${upc}.xml`);
		fs.writeFileSync(mainXmlPath, xmlContent, 'utf-8');
		this.logger.log(`[XML_CREATED] ${mainXmlPath}`);

		// 7. Generate BatchComplete XML
		const batchCompleteXml = this.generateBatchCompleteXml(batchId, upc);
		const batchXmlPath = path.join(
			releaseDir,
			`BatchComplete_${batchId}.xml`,
		);
		fs.writeFileSync(batchXmlPath, batchCompleteXml, 'utf-8');
		this.logger.log(`[BATCH_XML_CREATED] ${batchXmlPath}`);

		// ZIP
		const zipPath = `${outputRoot}.zip`;
		await zipFolder(outputRoot, zipPath);

		await this.releaseRepo.update(releaseId, {
			metadataSpotify: {
				...release.metadataSpotify,
				folderServer: zipPath.replace(/\\/g, '/'),
				// batchId,
			},
		});

		this.logger.log(`[COMPLETED] Batch ${batchId} - ${upc}`);

		return {
			// batchId,
			outputDir: outputRoot,
			zipPath,
		};
	}

	async uploadMetadataSpotifyToSftp(releaseId: string) {
		const release = await this.releaseQuery.findOneReleaseFullCi(releaseId);

		const sftp = await this.sftpConfigsService.getSftpSpotify();

		// await this.sftpConnectService.uploadFile({
		// 	sftp,
		// 	localFile: release.metadataSpotify?.folderServer ?? '',
		// 	remoteDir: '/home/spotify',
		// });

		await uploadFileToSftp({
			sftp,
			localFile: release.metadataSpotify?.folderServer ?? '',
			remoteDir: '/home/spotify',
		});

		await removeFolder(release.metadataSpotify?.folderServer ?? '');
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
	private async processCoverImageSpotify(
		coverImage: CoverImageInfo,
		resourcesDir: string,
		upc: string,
	): Promise<void> {
		const img = await resizeCoverImageTo3000x3000({
			buffer: coverImage.buffer,
		});

		const ext = this.normalizeImageExtension(coverImage.extension);
		const fileName = `${upc}${ext}`;
		const outputPath = path.join(resourcesDir, fileName);

		await img.toFile(outputPath);
		this.logger.log(`[COVER_SAVED] ${fileName}`);
	}

	/**
	 * Process audio files - save to resources folder
	 * Format: resources/{ISRC}_T{trackNo}S.{ext}
	 * Example: resources/QT6KL2500010_T1S.wav
	 */
	private processAudioFilesSpotify(
		audioFiles: AudioFileInfo[],
		resourcesDir: string,
	) {
		for (const audio of audioFiles) {
			const ext = this.normalizeAudioExtension(audio.extension);
			const trackNoStr = String(audio.trackNo).padStart(1, '0'); // T1S, T2S, ...
			const fileName = `${audio.isrc}_T${trackNoStr}S${ext}`;
			const filePath = path.join(resourcesDir, fileName);

			fs.writeFileSync(filePath, audio.buffer);
			this.logger.log(`[AUDIO_SAVED] ${fileName}`);
		}
	}

	// ==================== DDEX DATA PARSING ====================

	/**
	 * Parse Release entity sang DDEXData structure
	 */
	private parseDDEXDataFromRelease(
		release: Release,
		batchId: string,
	): DDEXData {
		const tracks = [...release.tracks].sort((a, b) => a.order - b.order);

		// Build all sections
		const parties = this.buildParties(release, tracks);
		const resources = this.buildResources(release, tracks, parties);
		const releases = this.buildReleases(release, resources, parties);
		const deals = this.buildDeals(release, tracks);

		return {
			messageHeader: {
				messageId: batchId.slice(-5), // Last 5 digits
				sender: {
					partyId: this.SENDER_DPID,
					partyName: this.SENDER_NAME,
				},
				recipient: {
					partyId: this.SPOTIFY_DPID,
					partyName: this.SPOTIFY_NAME,
				},
			},
			parties,
			resources,
			releases,
			deals,
		};
	}

	/**
	 * Build PartyList từ Release + Tracks
	 * Include: Artists (release + track level) và Label
	 */
	private buildParties(release: Release, tracks: Track[]): DDEXParty[] {
		const partiesMap = new Map<string, DDEXParty>();
		let partyIndex = 1;

		// Helper: Add party if not exists
		const addArtistParty = (artist: Artist): string => {
			const key = `artist_${artist.id}`;
			if (!partiesMap.has(key)) {
				const party: DDEXParty = {
					reference: `P${partyIndex++}`,
					name: artist.name,
				};

				// Add Spotify ID if available
				if (artist.spotifyId) {
					party.partyId = {
						namespace: this.SPOTIFY_DPID,
						value: `spotify:artist:${artist.spotifyId}`,
					};
				}

				partiesMap.set(key, party);
			}
			return partiesMap.get(key)!.reference;
		};

		// 1. Add release artists
		if (release.releaseArtists) {
			for (const ra of release.releaseArtists) {
				if (ra.artist) {
					addArtistParty(ra.artist);
				}
			}
		}

		// 2. Add track artists and contributors
		for (const track of tracks) {
			// Track artists
			if (track.trackArtists) {
				for (const ta of track.trackArtists) {
					if (ta.artist) {
						addArtistParty(ta.artist);
					}
				}
			}

			// Track contributors (assuming they reference artists)
			if (track.trackContributors) {
				for (const tc of track.trackContributors) {
					// Note: You may need to adjust based on your TrackContributor structure
					// If trackContributor has artist relation:
					if (tc.artist) {
						addArtistParty(tc.artist);
					}
				}
			}
		}

		// 3. Add label as party
		if (release.label) {
			const labelKey = `label_${release.label.id}`;
			if (!partiesMap.has(labelKey)) {
				partiesMap.set(labelKey, {
					reference: `P${partyIndex++}`,
					name: release.label.name,
				});
			}
		}

		return Array.from(partiesMap.values());
	}

	/**
	 * Build ResourceList (SoundRecordings + Image)
	 */
	private buildResources(
		release: Release,
		tracks: Track[],
		parties: DDEXParty[],
	): DDEXResource[] {
		const resources: DDEXResource[] = [];

		// Helper: Get party reference by artist
		const getPartyRefByArtist = (artist: Artist): string => {
			const party = parties.find((p) => p.name === artist.name);
			return party?.reference || 'P1';
		};

		// 1. Sound Recordings
		tracks.forEach((track, index) => {
			const trackNo = index + 1;
			const displayArtists: DDEXDisplayArtist[] = [];
			const contributors: DDEXContributor[] = [];

			// Build display artists
			if (track.trackArtists && track.trackArtists.length > 0) {
				track.trackArtists.forEach((ta, seq) => {
					if (ta.artist) {
						displayArtists.push({
							partyRef: getPartyRefByArtist(ta.artist),
							// role: ta.role || 'MainArtist',
							role: 'MainArtist',
							sequenceNumber: seq + 1,
						});
					}
				});
			}

			// Build contributors
			if (track.trackContributors && track.trackContributors.length > 0) {
				track.trackContributors.forEach((tc, seq) => {
					// Adjust based on your TrackContributor structure
					if (tc.artist) {
						contributors.push({
							partyRef: getPartyRefByArtist(tc.artist),
							// role: tc.role || 'Composer',
							role: 'MainArtist',
							sequenceNumber: seq + 1,
						});
					}
				});
			}

			// Display artist name
			const displayArtistName =
				track.trackArtists && track.trackArtists.length > 0
					? track.trackArtists
							.map((ta) => ta.artist?.name || 'Unknown')
							.join(', ')
					: 'Unknown Artist';

			// Build resource
			resources.push({
				reference: `A${trackNo}`,
				type: 'SoundRecording',
				isrc: track.isrc || undefined,
				title: this.buildTrackTitle(track),
				displayArtistName,
				displayArtists,
				contributors,
				duration: this.convertDurationToISO8601(
					track.audioFile?.duration || 0,
				),
				pLine: {
					year:
						track.pLineYear ||
						release.pLineYear ||
						new Date().getFullYear(),
					text:
						track.pLineOwner ||
						release.pLineOwner ||
						this.SENDER_NAME,
				},
				technicalDetails: {
					reference: `T${trackNo}S`,
					fileUri: `resources/${track.isrc || `TEMP${trackNo}`}_T${trackNo}S.wav`,
					isProvidedInDelivery: true,
				},
				parentalWarningType: this.mapParentalWarning(
					track.trackSensitive,
				),
			});
		});

		// 2. Cover Art
		const coverArtIndex = tracks.length + 1;
		resources.push({
			reference: `A${coverArtIndex}`,
			type: 'Image',
			imageType: 'FrontCoverImage',
			cLine: {
				year: release.cLineYear || new Date().getFullYear(),
				text: release.cLineOwner || this.SENDER_NAME,
			},
			technicalDetails: {
				reference: `T${coverArtIndex}`,
				fileUri: `resources/${release.upc}.jpg`,
			},
			parentalWarningType: 'NotExplicit',
		});

		return resources;
	}

	/**
	 * Build ReleaseList (main release R0)
	 */
	private buildReleases(
		release: Release,
		resources: DDEXResource[],
		parties: DDEXParty[],
	): DDEXRelease[] {
		// Get label reference
		const labelRef = release.label
			? parties.find((p) => p.name === release.label!.name)?.reference ||
				'P1'
			: 'P1';

		// Build display artists
		const displayArtists: DDEXDisplayArtist[] = [];
		if (release.releaseArtists && release.releaseArtists.length > 0) {
			release.releaseArtists.forEach((ra, index) => {
				const party = parties.find((p) => p.name === ra.artist?.name);
				if (party && ra.artist) {
					displayArtists.push({
						partyRef: party.reference,
						// role: ra.role || 'MainArtist',
						role: 'MainArtist',
						sequenceNumber: index + 1,
					});
				}
			});
		}

		// Display artist name
		const displayArtistName =
			release.releaseArtists && release.releaseArtists.length > 0
				? release.releaseArtists
						.map((ra) => ra.artist?.name || 'Unknown')
						.join(', ')
				: 'Unknown Artist';

		// Get resource references
		const soundRecordings = resources.filter(
			(r) => r.type === 'SoundRecording',
		);
		const coverArt = resources.find((r) => r.type === 'Image');

		// Build main release
		const mainRelease: DDEXRelease = {
			reference: 'R0',
			type: this.mapReleaseType(release.albumFormat?.code),
			icpn: release.upc!,
			title: this.buildReleaseTitle(release),
			displayArtistName,
			displayArtists,
			labelRef,
			pLine: {
				year: release.pLineYear || new Date().getFullYear(),
				text: release.pLineOwner || this.SENDER_NAME,
			},
			cLine: {
				year: release.cLineYear || new Date().getFullYear(),
				text: release.cLineOwner || this.SENDER_NAME,
			},
			genre: release.primaryGenre?.name || 'Pop',
			releaseDate: this.formatDateYYYYMMDD(release?.releaseDate),
			resourceRefs: soundRecordings.map((r) => r.reference),
			coverArtRef: coverArt?.reference,
			parentalWarningType: 'NotExplicit',
		};

		return [mainRelease];
	}

	/**
	 * Build DealList
	 */
	private buildDeals(release: Release, tracks: Track[]): DDEXDeal[] {
		const deals: DDEXDeal[] = [];
		const releaseDateTime = this.formatDateTimeISO8601(
			release?.releaseDate,
		);
		const territories = this.getTerritoriesFromRelease(release);

		// Main release deal
		deals.push({
			releaseRef: 'R0',
			territories,
			validityStartDateTime: releaseDateTime,
			commercialModelTypes: [
				'SubscriptionModel',
				'AdvertisementSupportedModel',
			],
			useTypes: ['ConditionalDownload', 'Stream'],
		});

		// Track deals
		tracks.forEach((track, index) => {
			deals.push({
				releaseRef: `R${index + 1}`,
				territories,
				validityStartDateTime: releaseDateTime,
				commercialModelTypes: [
					'SubscriptionModel',
					'AdvertisementSupportedModel',
				],
				useTypes: ['ConditionalDownload', 'Stream'],
				technicalResourceRef: `T${index + 1}S`,
			});
		});

		return deals;
	}

	// ==================== XML GENERATION ====================

	/**
	 * Generate BatchComplete XML
	 */
	private generateBatchCompleteXml(batchId: string, upc: string): string {
		const now = new Date().toISOString();

		return `<?xml version="1.0" encoding="UTF-8"?>
<ernm:BatchComplete xmlns:ernm="http://ddex.net/xml/ern-main/43" 
                     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                     xsi:schemaLocation="http://ddex.net/xml/ern-main/43 http://ddex.net/xml/ern-main/43/batch.xsd">
    <MessageHeader>
        <MessageId>${batchId}</MessageId>
        <MessageSender>
            <PartyId>${this.SENDER_DPID}</PartyId>
            <PartyName>
                <FullName>${this.SENDER_NAME}</FullName>
            </PartyName>
        </MessageSender>
        <MessageRecipient>
            <PartyId>${this.SPOTIFY_DPID}</PartyId>
            <PartyName>
                <FullName>${this.SPOTIFY_NAME}</FullName>
            </PartyName>
        </MessageRecipient>
        <MessageCreatedDateTime>${now}</MessageCreatedDateTime>
    </MessageHeader>
    <BatchId>${batchId}</BatchId>
    <MessageFileName>${upc}.xml</MessageFileName>
</ernm:BatchComplete>`;
	}

	// ==================== HELPER METHODS ====================

	/**
	 * Build track title with version
	 */
	private buildTrackTitle(track: Track): string {
		let title = track.title;
		if (track.version) {
			title += ` (${track.version})`;
		}
		return title;
	}

	/**
	 * Build release title with version
	 */
	private buildReleaseTitle(release: Release): string {
		let title = release.title;
		if (release.version) {
			title += ` (${release.version})`;
		}
		return title;
	}

	/**
	 * Map album format code to DDEX ReleaseType
	 */
	private mapReleaseType(formatCode?: string): 'Album' | 'Single' | 'EP' {
		if (!formatCode) return 'Album';

		const code = formatCode.toLowerCase();
		if (code.includes('single')) return 'Single';
		if (code.includes('ep')) return 'EP';
		if (code.includes('album')) return 'Album';

		return 'Album'; // Default
	}

	/**
	 * Map track sensitive to parental warning
	 */
	private mapParentalWarning(
		trackSensitive?: any,
	): 'Explicit' | 'NotExplicit' {
		if (!trackSensitive) return 'NotExplicit';

		// Adjust based on your TrackSensitive entity structure
		// Example: if trackSensitive has 'code' field
		if (trackSensitive.code === 'EXPLICIT') {
			return 'Explicit';
		}

		return 'NotExplicit';
	}

	/**
	 * Get territories from release
	 */
	private getTerritoriesFromRelease(release: Release): string[] {
		if (release.releaseTerritory?.selectedCountries) {
			// Assuming territories is an array of country codes
			// Example: ['US', 'CA', 'GB']
			const territories = release.releaseTerritory.selectedCountries;

			if (Array.isArray(territories) && territories.length > 0) {
				return territories;
			}
		}

		// Default to US
		return ['US'];
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
	private formatDateYYYYMMDD(date: Date | null): string {
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
	 * Format date to ISO 8601 datetime
	 * Example: 2025-12-20T00:00:00
	 */
	private formatDateTimeISO8601(date: Date | null): string {
		if (!date) {
			return new Date().toISOString();
		}

		const formatted = this.formatDateYYYYMMDD(date);
		return `${formatted}T00:00:00`;
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
