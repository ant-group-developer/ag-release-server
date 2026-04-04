import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { ArtistSource } from 'src/modules/artist/enum/artist.enum';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';

import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseContributor } from 'src/modules/release-contributor/entities/release-contributor.entity';
import { ReleaseDspDelivery } from 'src/modules/release/modules/release-dsp-delivery/entities/release-dsp-delivery.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseTerritory } from 'src/modules/release-territory/entities/release-territory.entity';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackContributor } from 'src/modules/track-contributor/entities/track-contributor.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { DataSource, EntityManager } from 'typeorm';
import {
	EXCEL_COLUMNS as C,
	COLUMN_TO_ROLE_CODE,
	CONTRIBUTOR_ROLE_COLUMNS,
	RELEASE_CONTRIBUTOR_COLUMNS,
} from '../constants/excel-columns.constant';

export interface ExcelLookupMaps {
	albumFormat: Map<string, string>; // name → id
	genre: Map<string, string>;
	label: Map<string, string>;
	trackSensitive: Map<string, string>; // code → id
	artistRole: Map<string, string>; // code → id
	language: Map<string, string>; // name → id
	dsp: Map<string, string>; // code → id
	artist: Map<string, string>; // name → id
	country: Map<string, string>; // iso2 → id
	countryByName: Map<string, string>; // name → id
	defaultTrackTypeId: string | null;
	defaultTrackOriginTypeId: string | null;
}

@Injectable()
export class ExcelMapperService {
	private readonly logger = new Logger(ExcelMapperService.name);

	constructor(private readonly dataSource: DataSource) {}

	/**
	 * Map Excel rows to a Release entity with all sub-entities.
	 * All rows share the same album-level data; each row is one track.
	 */
	mapExcelToRelease(
		excelData: Record<string, unknown>[],
		storageKeys: string[],
		maps: ExcelLookupMaps,
		batchId: string,
		releaseFolder: string,
		audioMetadata?: Record<
			string,
			{
				sampleRate: number | null;
				bitrate: number | null;
				bitDepth: number | null;
				duration: number | null;
			}
		>,
	) {
		const firstRow = excelData[0];

		// --- Release ---
		const release = new Release();
		release.upc = this.str(firstRow[C.UPC]);
		release.title = this.str(firstRow[C.ALBUM_TITLE]) || releaseFolder;
		release.version = this.str(firstRow[C.ALBUM_SUBTITLE]) || null;
		release.albumFormatId =
			maps.albumFormat.get(this.str(firstRow[C.RELEASE_TYPE]) || '') ||
			'';
		release.primaryGenreId =
			maps.genre.get(this.str(firstRow[C.GENRE]) || '') || null;
		release.labelId =
			maps.label.get(this.str(firstRow[C.LABEL]) || '') || null;
		release.catalogId = this.str(firstRow[C.CATALOG_NUMBER]) || null;
		release.status = ReleaseStatus.DRAFT;

		// C-Line
		const cLine = this.parseCPLine(this.str(firstRow[C.C_LINE]));
		release.cLineYear = cLine.year;
		release.cLineOwner = cLine.owner;

		// P-Line
		const pLine = this.parseCPLine(this.str(firstRow[C.P_LINE]));
		release.pLineYear = pLine.year;
		release.pLineOwner = pLine.owner;

		// Release date
		const releaseDateStr = this.str(firstRow[C.RELEASE_DATE]);
		release.releaseDate = releaseDateStr ? new Date(releaseDateStr) : null;
		release.releaseTime = this.str(firstRow[C.RELEASE_DATE_TIME]) || null;

		// metadataCi
		release.metadataCi = {
			folderBucket: `releases/${batchId}/${releaseFolder}`,
			folderServer: null,
			batchId,
		};

		// --- Release Territory ---
		const releaseTerritory = new ReleaseTerritory();
		const territory = this.str(firstRow[C.TERRITORY_AVAILABILITY]);
		const isWorldwide = territory?.toUpperCase() === 'WW';
		releaseTerritory.distributeWorldwide = isWorldwide;

		if (!isWorldwide && territory) {
			releaseTerritory.distributionType =
				DistributionType.DISTRIBUTE_ONLY_IN;
			const codes = territory
				.split('|')
				.map((c) => c.trim().toUpperCase());
			releaseTerritory.selectedCountries = codes
				.map((c) => maps.country.get(c))
				.filter((id): id is string => !!id);
		}

		// --- Release Language ---
		const releaseLanguage = new ReleaseLanguage();
		const relMetaLang = this.str(firstRow[C.METADATA_LANGUAGE]);
		if (relMetaLang) {
			releaseLanguage.metadataLanguageId =
				maps.language.get(relMetaLang) || null;
		}
		const relMetaCountry = this.str(firstRow[C.METADATA_LANGUAGE_COUNTRY]);

		if (relMetaCountry) {
			releaseLanguage.metadataLanguageCountryId =
				maps.countryByName.get(relMetaCountry) || null;
		}
		const relAudioLang = this.str(firstRow[C.AUDIO_LANGUAGE]);
		if (relAudioLang) {
			releaseLanguage.audioLanguageId =
				maps.language.get(relAudioLang) || null;
		}

		// --- Release Artists (Main) ---
		const releaseArtists: {
			artistName: string;
			entity: ReleaseArtist;
		}[] = [];
		const mainArtistRaw = this.str(firstRow[C.ALBUM_MAIN_ARTIST]);
		if (mainArtistRaw) {
			const names = mainArtistRaw
				.split('|')
				.map((s) => s.trim())
				.filter(Boolean);
			for (const name of names) {
				const ra = new ReleaseArtist();
				ra.addArtistToTracks = true;
				releaseArtists.push({ artistName: name, entity: ra });
			}
		}

		// --- Release Contributors (Featured) ---
		const releaseContributors: {
			artistName: string;
			roleCode: string;
			entity: ReleaseContributor;
		}[] = [];
		for (const col of RELEASE_CONTRIBUTOR_COLUMNS) {
			const raw = this.str(firstRow[col]);
			if (!raw) continue;

			const roleCode = COLUMN_TO_ROLE_CODE[col] || col;
			const names = raw
				.split('|')
				.map((s) => s.trim())
				.filter(Boolean);
			for (const name of names) {
				const rc = new ReleaseContributor();
				rc.addContributorToTracks = false;
				releaseContributors.push({
					artistName: name,
					roleCode,
					entity: rc,
				});
			}
		}

		// --- Publisher → DSP Delivery ---
		const dspDeliveries: ReleaseDspDelivery[] = [];
		const publisherStr = this.str(firstRow[C.PUBLISHER]);
		if (publisherStr) {
			const codes = publisherStr.split('|').map((s) => s.trim());
			for (const code of codes) {
				const dspId = maps.dsp.get(code);
				if (dspId) {
					const delivery = new ReleaseDspDelivery();
					delivery.dspId = dspId;
					dspDeliveries.push(delivery);
				} else {
					this.logger.warn(
						`DSP not found for code "${code}" — skipping`,
					);
				}
			}
		}

		// --- Tracks ---
		const tracks: {
			track: Track;
			trackArtists: { artistName: string; entity: TrackArtist }[];
			trackContributors: {
				artistName: string;
				roleCode: string;
				entity: TrackContributor;
			}[];
			trackLanguage: TrackLanguage;
			audioFile: AudioFile | null;
			audioStorageKey: string | null;
		}[] = [];

		for (let i = 0; i < excelData.length; i++) {
			const row = excelData[i];

			const track = new Track();
			track.id = nanoid(10);
			track.title = this.str(row[C.TRACK_TITLE]) || `Track ${i + 1}`;
			track.version = this.str(row[C.TRACK_SUBTITLE]) || null;
			track.isrc = this.str(row[C.ISRC]) || null;
			track.iswc = this.str(row[C.ISWC]) || null;
			track.order = Number(row[C.TRACK_NUMBER]) || i + 1;
			track.trackTypeId = maps.defaultTrackTypeId;
			track.trackOriginTypeId = maps.defaultTrackOriginTypeId;

			// P-Line
			const pLine = this.parseCPLine(this.str(row[C.P_LINE]));
			track.pLineYear = pLine.year;
			track.pLineOwner = pLine.owner;

			// Genre (same lookup as release)
			track.primaryGenreId =
				maps.genre.get(this.str(row[C.GENRE]) || '') || null;

			// Parental-Warning → TrackSensitive
			const parentalWarning = this.str(row[C.PARENTAL_WARNING]);
			if (parentalWarning) {
				track.trackSensitiveId =
					maps.trackSensitive.get(parentalWarning) || null;
			}

			// --- Track Language ---
			const trackLanguage = new TrackLanguage();
			trackLanguage.trackId = track.id;
			const trkMetaLang = this.str(row[C.METADATA_LANGUAGE]);
			if (trkMetaLang) {
				trackLanguage.metadataLanguageId =
					maps.language.get(trkMetaLang) || null;
			}
			const trkMetaCountry = this.str(row[C.METADATA_LANGUAGE_COUNTRY]);
			if (trkMetaCountry) {
				const countryId =
					maps.countryByName.get(trkMetaCountry) || null;
				trackLanguage.metadataLanguageCountryId = countryId;
				trackLanguage.recordingCountryId = countryId;
			}
			const trkAudioLang = this.str(row[C.AUDIO_LANGUAGE]);
			if (trkAudioLang) {
				trackLanguage.audioLanguageId =
					maps.language.get(trkAudioLang) || null;
			}

			// --- Track Main Artist ---
			const trackArtists: {
				artistName: string;
				entity: TrackArtist;
			}[] = [];
			const trackMainRaw = this.str(row[C.TRACK_MAIN_ARTIST]);
			if (trackMainRaw) {
				const names = trackMainRaw
					.split('|')
					.map((s) => s.trim())
					.filter(Boolean);
				for (const name of names) {
					const ta = new TrackArtist();
					ta.trackId = track.id;
					ta.isFromTrackAction = true;
					trackArtists.push({
						artistName: name,
						entity: ta,
					});
				}
			}

			// --- Track Contributors ---
			const trackContributors: {
				artistName: string;
				roleCode: string;
				entity: TrackContributor;
			}[] = [];
			for (const col of CONTRIBUTOR_ROLE_COLUMNS) {
				const raw = this.str(row[col]);
				if (!raw) continue;

				const roleCode = COLUMN_TO_ROLE_CODE[col] || col;
				const names = raw
					.split('|')
					.map((s) => s.trim())
					.filter(Boolean);
				for (const name of names) {
					const tc = new TrackContributor();
					tc.trackId = track.id;
					tc.isFromTrackAction = true;
					trackContributors.push({
						artistName: name,
						roleCode,
						entity: tc,
					});
				}
			}

			// --- AudioFile (duration from Track-Length) ---
			let audioFile: AudioFile | null = null;
			const trackLength = this.str(row[C.TRACK_LENGTH]);
			const isrc = track.isrc;

			// Find matching storage key for this track's audio
			const _audioStorageKey = isrc
				? storageKeys.find((k) => k.includes(isrc))
				: null;

			if (trackLength || (isrc && audioMetadata?.[isrc])) {
				audioFile = new AudioFile();
				audioFile.trackId = track.id;

				// Use extracted metadata if available, fallback to Excel
				const meta = isrc ? audioMetadata?.[isrc] : null;
				audioFile.duration =
					meta?.duration ??
					(trackLength ? this.parseTrackLength(trackLength) : 0);
				audioFile.sampleRate = meta?.sampleRate
					? String(meta.sampleRate)
					: '44100';
				audioFile.bitrate = meta?.bitrate ?? null;
				audioFile.bitDepth = meta?.bitDepth ?? null;

				const sampleLenStr = this.str(row[C.TRACK_SAMPLE_LENGTH]);
				if (sampleLenStr) {
					audioFile.sampleLength =
						this.parseTrackLength(sampleLenStr);
				}
				const hookStr = this.str(row[C.TRACK_HOOK]);
				if (hookStr) {
					audioFile.preview = this.parseTrackLength(hookStr);
				}
			}

			tracks.push({
				track,
				trackArtists,
				trackContributors,
				trackLanguage,
				audioFile,
				audioStorageKey: _audioStorageKey || null,
			});
		}

		// --- Merge unique track contributors into releaseContributors ---
		const existingKeys = new Set(
			releaseContributors.map((rc) => `${rc.artistName}|${rc.roleCode}`),
		);
		for (const t of tracks) {
			for (const tc of t.trackContributors) {
				const key = `${tc.artistName}|${tc.roleCode}`;
				if (existingKeys.has(key)) continue;
				existingKeys.add(key);
				const rc = new ReleaseContributor();
				rc.addContributorToTracks = false;
				releaseContributors.push({
					artistName: tc.artistName,
					roleCode: tc.roleCode,
					entity: rc,
				});
			}
		}

		return {
			release,
			releaseTerritory,
			releaseLanguage,
			releaseArtists,
			releaseContributors,
			dspDeliveries,
			tracks,
		};
	}

	/**
	 * Resolve artist names to IDs, auto-creating artists that don't exist.
	 */
	async resolveArtistIds(
		artistNames: string[],
		maps: ExcelLookupMaps,
		manager: EntityManager,
	): Promise<Map<string, string>> {
		const resolved = new Map<string, string>();

		for (const name of artistNames) {
			if (!name || resolved.has(name)) continue;

			const existingId = maps.artist.get(name);
			if (existingId) {
				resolved.set(name, existingId);
				continue;
			}

			// Auto-create artist
			const artist = new Artist();
			artist.id = nanoid(10);
			artist.name = name;
			artist.code = nanoid(10);
			artist.artistSource = ArtistSource.ANT_MUSIC;

			await manager.save(Artist, artist);
			maps.artist.set(name, artist.id);
			resolved.set(name, artist.id);

			this.logger.log(`Auto-created artist "${name}" (${artist.id})`);
		}

		return resolved;
	}

	/**
	 * Parse C-Line / P-Line string: "2026 AMG, Exclusive Licensed ANT MUSIC"
	 * → { year: 2026, owner: "AMG, Exclusive Licensed ANT MUSIC" }
	 */
	parseCPLine(value: string | null): {
		year: number | null;
		owner: string | null;
	} {
		if (!value) return { year: null, owner: null };

		const match = value.match(/^(\d{4})\s+(.+)$/);
		if (match) {
			return {
				year: parseInt(match[1], 10),
				owner: match[2].trim(),
			};
		}

		return { year: null, owner: value };
	}

	/**
	 * Parse track length "3:03" → 183 (seconds)
	 */
	parseTrackLength(value: string): number {
		const parts = value.split(':');
		if (parts.length === 2) {
			return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
		}
		if (parts.length === 3) {
			return (
				parseInt(parts[0], 10) * 3600 +
				parseInt(parts[1], 10) * 60 +
				parseInt(parts[2], 10)
			);
		}
		return parseInt(value, 10) || 0;
	}

	private str(value: unknown): string | null {
		if (value === null || value === undefined) return null;
		if (typeof value === 'object') return null;
		return String(value as string | number | boolean).trim() || null;
	}
}
