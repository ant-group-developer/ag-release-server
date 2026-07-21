/**
 * DdexDataMapper — pure functions mapping Release snapshot payload → ErnInput2.
 *
 * Tái dùng business logic từ v3 ReleaseDdexService.parseErnInputFromRelease()
 * nhưng input là jsonb snapshot (Record<string, unknown>), KHÔNG phải ORM entity.
 *
 * GENRE_MAPPING import trực tiếp từ v3 const — single source of truth.
 */

import { GENRE_MAPPING } from '../../../distribution/file-metadata/ci/const';
import {
	ErnArtistInput,
	ErnContributorInput,
	ErnCopyrightInput,
	ErnDealInput2,
	ErnInput2,
	ErnTrackInput2,
	ErnVersion2,
} from '../../../ern2/interfaces/ern-input.interface';

// ============================================================================
// SNAPSHOT PAYLOAD TYPES (subset used for DDEX mapping)
// ============================================================================

/** Release snapshot jsonb — mirrors Release entity fields used for DDEX. */
export interface ReleaseSnapshotPayload {
	id: string;
	upc?: string;
	title?: string;
	version?: string;
	type?: string; // 'audio' | 'video'
	releaseDate?: string;
	releaseEndDate?: string;
	releaseTime?: string | null;
	releaseTimeMode?: string;
	timeZone?: { utc?: string };
	albumFormat?: { code?: string };
	primaryGenre?: { name?: string };
	subGenre?: { name?: string };
	label?: { name?: string };
	catalogId?: string;
	pLineYear?: number;
	pLineOwner?: string;
	cLineYear?: number;
	cLineOwner?: string;
	priceTier?: {
		amount?: number;
		currency?: { code?: string };
		ciCode?: string;
	};
	releaseArtists?: SnapshotArtist[];
	releaseCoverArts?: SnapshotCoverArt[];
	releaseTerritory?: SnapshotTerritory;
	tracks?: SnapshotTrack[];
}

interface SnapshotArtist {
	artist?: {
		name?: string;
		spotifyId?: string;
		appleMusicId?: string;
		artistProfiles?: { name?: string; dsp?: { code?: string } }[];
	};
}

interface SnapshotCoverArt {
	file?: { extension?: string };
	width?: number;
	height?: number;
}

interface SnapshotTerritory {
	distributeWorldwide?: boolean;
	distributionType?: string;
	selectedCountries?: string[];
}

interface SnapshotTrack {
	isrc?: string;
	title?: string;
	version?: string;
	order: number;
	isInstrumental?: boolean;
	primaryGenre?: { name?: string };
	subGenre?: { name?: string };
	trackSensitive?: { code?: string };
	trackLanguage?: { audioLanguage?: { code?: string } };
	pLineYear?: number;
	pLineOwner?: string;
	priceTier?: {
		amount?: number;
		currency?: { code?: string };
		ciCode?: string;
	};
	trackArtists?: {
		artist?: {
			name?: string;
			artistProfiles?: { name?: string; dsp?: { code?: string } }[];
		};
	}[];
	trackContributors?: {
		artist?: {
			name?: string;
			artistProfiles?: { name?: string; dsp?: { code?: string } }[];
		};
		artistRole?: { code?: string };
	}[];
	audioFile?: {
		duration?: number;
		file?: { extension?: string };
		bitrate?: number;
		sampleRate?: string;
		bitDepth?: number;
	};
}

// ============================================================================
// BUILD CONFIG (from DspRoutingConfigsService resolution)
// ============================================================================

export interface DdexBuildConfig {
	ernVersion: ErnVersion2;
	sender: { partyId: string; name: string };
	recipient: { partyId: string; name: string };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PRICE_CURRENCY_CODE = 'USD';
const DEFAULT_PRICE_RANGE_TYPE = 'mid';
const NO_LINGUISTIC_CONTENT_LANGUAGE = 'zxx';
const SPOTIFY_DSP_CODE = 'SPOTIFY'; // DspCode.SPOTIFY stringified

// ============================================================================
// MAIN MAPPER
// ============================================================================

/**
 * Map Release snapshot payload + DDEX config → ErnInput2 (ready for ErnService2.generate()).
 *
 * Pure function, no I/O. Territory logic simplified — uses snapshot.releaseTerritory directly
 * without CountryService dependency (DISTRIBUTE_EVERYWHERE_EXCEPT not fully supported;
 * falls back to Worldwide if no selectedCountries).
 */
export function mapSnapshotToErnInput(
	snapshot: ReleaseSnapshotPayload,
	config: DdexBuildConfig,
): ErnInput2 {
	const cover = snapshot.releaseCoverArts?.[0];
	const coverExt = cover
		? normalizeImageExtension(cover.file?.extension ?? 'jpg')
		: '.jpg';

	const territories = extractTerritories(snapshot.releaseTerritory);
	const parentalWarning = resolveReleaseParentalWarning(
		snapshot.tracks ?? [],
	);

	return {
		version: config.ernVersion,

		message: {
			id: snapshot.upc ?? snapshot.id,
			sender: {
				partyId: config.sender.partyId,
				name: config.sender.name,
			},
			recipient: {
				partyId: config.recipient.partyId,
				name: config.recipient.name,
			},
		},

		release: {
			upc: snapshot.upc ?? '',
			title: snapshot.title ?? '',
			version: snapshot.version ?? undefined,
			type: snapshot.albumFormat?.code ?? 'Album',
			releaseDate: snapshot.releaseDate
				? formatDate(snapshot.releaseDate)
				: '',
			releaseTime:
				snapshot.releaseTimeMode === 'SPECIFIC_TIMEZONE'
					? (snapshot.releaseTime ?? null)
					: null,
			releaseTimezoneOffset:
				snapshot.releaseTimeMode === 'SPECIFIC_TIMEZONE'
					? cleanTimezoneOffset(snapshot.timeZone?.utc)
					: null,
			genre: mapGenre(snapshot.primaryGenre?.name) ?? 'Pop',
			subGenre: mapGenre(snapshot.subGenre?.name),
			labelName: snapshot.label?.name ?? '',
			catalogNumber: snapshot.catalogId ?? undefined,
			artists: mapReleaseArtists(snapshot.releaseArtists ?? []),
			parentalWarning,
			pLine: mapCopyright(snapshot.pLineYear, snapshot.pLineOwner),
			cLine: mapCopyright(snapshot.cLineYear, snapshot.cLineOwner),
			territories,
			coverArt: cover
				? {
						fileName: `${snapshot.upc}${coverExt}`,
						filePath: 'resources',
						codecType: getImageMimeType(coverExt),
						width: cover.width,
						height: cover.height,
					}
				: undefined,
		},

		tracks: [...(snapshot.tracks ?? [])]
			.sort((a, b) => a.order - b.order)
			.map((track, index) =>
				mapTrack(track, index, snapshot, territories),
			),

		deals: {
			release: [buildDeal(territories, snapshot)],
			tracks: [
				buildTrackDeal(
					territories,
					snapshot,
					'PayAsYouGoModel',
					'PermanentDownload',
				),
				buildTrackDeal(
					territories,
					snapshot,
					'AdvertisementSupportedModel',
					'Stream',
				),
				buildTrackDeal(
					territories,
					snapshot,
					'SubscriptionModel',
					'Stream',
				),
			],
		},
	};
}

// ============================================================================
// HELPERS
// ============================================================================

function mapTrack(
	track: SnapshotTrack,
	index: number,
	release: ReleaseSnapshotPayload,
	territories: string[],
): ErnTrackInput2 {
	const pw = normalizeParentalWarning(track.trackSensitive?.code);

	return {
		isrc: track.isrc ?? '',
		title: track.title ?? '',
		version: track.version ?? undefined,
		duration: convertDurationToISO8601(track.audioFile?.duration ?? 0),
		order: track.order,
		price: {
			priceType: 'StandardRetailPrice',
			value: track.priceTier?.amount ?? 0,
			currencyCode:
				track.priceTier?.currency?.code || DEFAULT_PRICE_CURRENCY_CODE,
			priceRangeType: track.priceTier?.ciCode || DEFAULT_PRICE_RANGE_TYPE,
		},
		genre:
			mapGenre(track.primaryGenre?.name) ??
			mapGenre(release.primaryGenre?.name),
		subGenre: mapGenre(track.subGenre?.name),
		...(track.isInstrumental
			? { isInstrumental: true }
			: {
					languageOfPerformance:
						track.trackLanguage?.audioLanguage?.code ??
						NO_LINGUISTIC_CONTENT_LANGUAGE,
				}),
		parentalWarning: pw,
		artists: mapTrackArtists(track.trackArtists ?? []),
		contributors: mapContributors(track.trackContributors ?? []),
		pLine: mapCopyright(track.pLineYear, track.pLineOwner),
		recordingMode: 'Stereo',
		audioFile: track.audioFile
			? {
					fileName: `${track.isrc}_T${index}S${normalizeAudioExtension(track.audioFile.file?.extension ?? 'wav')}`,
					filePath: 'resources',
					codecType:
						track.audioFile.file?.extension?.toUpperCase() ?? 'WAV',
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
	};
}

function mapReleaseArtists(artists: SnapshotArtist[]): ErnArtistInput[] {
	return artists.map((ra) => ({
		name: findSpotifyProfileName(ra.artist) ?? ra.artist?.name ?? '',
		role: 'MainArtist',
		spotifyId: ra.artist?.spotifyId,
		appleMusicId: ra.artist?.appleMusicId,
	}));
}

function mapTrackArtists(
	artists: NonNullable<SnapshotTrack['trackArtists']>,
): ErnArtistInput[] {
	return artists.map((ta) => ({
		name: findSpotifyProfileName(ta.artist) ?? ta.artist?.name ?? '',
		role: 'MainArtist',
	}));
}

function mapContributors(
	contributors: NonNullable<SnapshotTrack['trackContributors']>,
): ErnContributorInput[] {
	return contributors.map((c) => ({
		name: findSpotifyProfileName(c.artist) ?? c.artist?.name ?? '',
		role: c.artistRole?.code ?? '',
	}));
}

function findSpotifyProfileName(artist?: {
	artistProfiles?: { name?: string; dsp?: { code?: string } }[];
}): string | undefined {
	return artist?.artistProfiles?.find((p) => p.dsp?.code === SPOTIFY_DSP_CODE)
		?.name;
}

function mapCopyright(
	year?: number,
	owner?: string,
): ErnCopyrightInput | undefined {
	if (!year || !owner) return undefined;
	return { year, text: `${year} ${owner}` };
}

function mapGenre(name?: string): string | undefined {
	if (!name) return undefined;
	return GENRE_MAPPING[name] ?? name;
}

function extractTerritories(territory?: SnapshotTerritory): string[] {
	if (!territory) return ['Worldwide'];
	if (territory.distributeWorldwide) return ['Worldwide'];

	const selected = territory.selectedCountries ?? [];

	if (territory.distributionType === 'DISTRIBUTE_ONLY_IN') {
		return selected.length > 0 ? selected : ['Worldwide'];
	}

	// DISTRIBUTE_EVERYWHERE_EXCEPT: simplified fallback (no CountryService).
	// Full country-list subtraction deferred to production CountryService injection.
	if (
		territory.distributionType === 'DISTRIBUTE_EVERYWHERE_EXCEPT' &&
		selected.length === 0
	) {
		return ['Worldwide'];
	}

	return ['Worldwide'];
}

function resolveReleaseParentalWarning(tracks: SnapshotTrack[]): string {
	const hasExplicit = tracks.some((track) =>
		['Explicit', 'ExplicitContentEdited'].includes(
			normalizeParentalWarning(track.trackSensitive?.code),
		),
	);
	return hasExplicit ? 'Explicit' : 'NotExplicit';
}

function normalizeParentalWarning(code?: string): string {
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
}

function buildDeal(
	territories: string[],
	release: ReleaseSnapshotPayload,
): ErnDealInput2 {
	return {
		territories,
		startDate: release.releaseDate ? formatDate(release.releaseDate) : '',
		endDate: release.releaseEndDate
			? formatDate(release.releaseEndDate)
			: '',
		commercialModels: ['PayAsYouGoModel'],
		useTypes: ['PermanentDownload'],
		price: {
			priceType: 'StandardRetailPrice',
			value: release.priceTier?.amount ?? 0,
			currencyCode:
				release.priceTier?.currency?.code ||
				DEFAULT_PRICE_CURRENCY_CODE,
			priceRangeType:
				release.priceTier?.ciCode || DEFAULT_PRICE_RANGE_TYPE,
		},
	};
}

function buildTrackDeal(
	territories: string[],
	release: ReleaseSnapshotPayload,
	commercialModel: string,
	useType: string,
): ErnDealInput2 {
	const firstTrack = release.tracks?.[0];
	return {
		territories,
		startDate: release.releaseDate ? formatDate(release.releaseDate) : '',
		endDate: release.releaseEndDate
			? formatDate(release.releaseEndDate)
			: '',
		commercialModels: [commercialModel],
		useTypes: [useType],
		price: {
			priceType: 'StandardRetailPrice',
			value: firstTrack?.priceTier?.amount ?? 0,
			currencyCode:
				firstTrack?.priceTier?.currency?.code ||
				DEFAULT_PRICE_CURRENCY_CODE,
			priceRangeType:
				firstTrack?.priceTier?.ciCode || DEFAULT_PRICE_RANGE_TYPE,
		},
	};
}

// ── Date/time helpers ──

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return dateStr;
	return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function cleanTimezoneOffset(utc?: string): string | null {
	if (!utc) return null;
	// Remove 'UTC' prefix if present, normalize format
	const cleaned = utc.replace(/^UTC\s*/i, '').trim();
	return cleaned || null;
}

function convertDurationToISO8601(durationInSeconds: number): string {
	if (!durationInSeconds || durationInSeconds <= 0) return 'PT0S';
	const hours = Math.floor(durationInSeconds / 3600);
	const minutes = Math.floor((durationInSeconds % 3600) / 60);
	const seconds = Math.floor(durationInSeconds % 60);

	let result = 'PT';
	if (hours > 0) result += `${hours}H`;
	if (minutes > 0) result += `${minutes}M`;
	if (seconds > 0) result += `${seconds}S`;
	return result === 'PT' ? 'PT0S' : result;
}

// ── File extension helpers ──

function normalizeImageExtension(ext: string): string {
	const cleaned = ext.replace(/^\./, '').toLowerCase();
	switch (cleaned) {
		case 'jpg':
		case 'jpeg':
			return '.jpg';
		case 'png':
			return '.png';
		default:
			return `.${cleaned}`;
	}
}

function getImageMimeType(ext: string): string {
	const cleaned = ext.replace(/^\./, '').toLowerCase();
	switch (cleaned) {
		case 'jpg':
		case 'jpeg':
			return 'JPEG';
		case 'png':
			return 'PNG';
		default:
			return cleaned.toUpperCase();
	}
}

function normalizeAudioExtension(ext: string): string {
	const cleaned = ext.replace(/^\./, '').toLowerCase();
	switch (cleaned) {
		case 'wav':
			return '.wav';
		case 'flac':
			return '.flac';
		case 'mp3':
			return '.mp3';
		default:
			return `.${cleaned}`;
	}
}
