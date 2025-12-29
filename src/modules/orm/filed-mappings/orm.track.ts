export const TrackFields = {
	// basic fields
	ID: 'track.id',
	TITLE: 'track.title',
	VERSION: 'track.version',
	ISRC: 'track.isrc',
	ISWC: 'track.iswc',
	ORDER: 'track.order',
	IS_BY_AI: 'track.isByAi',
	LYRIC: 'track.lyric',
	COPY_ARTISTS_FROM_RELEASE: 'track.copyArtistsFromRelease',
	SCAN_COPYRIGHT_STATUS: 'track.scanCopyrightStatus',

	// date
	CREATED_AT: 'track.createdAt',
	UPDATED_AT: 'track.updatedAt',

	// relation id fields
	RELEASE_ID: 'track.releaseId',
	PRIMARY_GENRE_ID: 'track.primaryGenreId',
	SUB_GENRE_ID: 'track.subGenreId',
	TRACK_TYPE_ID: 'track.trackTypeId',
	TRACK_ORIGIN_TYPE_ID: 'track.trackOriginTypeId',
	TRACK_SENSITIVE_ID: 'track.trackSensitiveId',
	PRICE_TIER_ID: 'track.priceTierId',

	// copyright lines
	P_LINE_YEAR: 'track.pLineYear',
	P_LINE_OWNER: 'track.pLineOwner',

	// relations
	RELEASE: 'track.release',
	PRIMARY_GENRE: 'track.primaryGenre',
	SUB_GENRE: 'track.subGenre',
	TRACK_ARTISTS: 'track.trackArtists',
	TRACK_LANGUAGE: 'track.trackLanguage',
	TRACK_LOCALIZES: 'track.trackLocalizes',
	AUDIO_FILE: 'track.audioFile',
	TRACK_TYPE: 'track.trackType',
	TRACK_ORIGIN_TYPE: 'track.trackOriginType',
	TRACK_SCAN_HISTORIES: 'track.trackScanHistories',
	PRICE_TIER: 'track.priceTier',
	TRACK_POLICIES: 'track.trackPolicies',
	TRACK_SENSITIVE: 'track.trackSensitive',
	TRACK_REVENUES: 'track.trackRevenues',
};

export const trackFieldsSimple = [
	TrackFields.ID,
	TrackFields.TITLE,
	TrackFields.ISRC,
	TrackFields.CREATED_AT,
	TrackFields.UPDATED_AT,
];
