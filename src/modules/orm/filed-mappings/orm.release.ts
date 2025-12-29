// src/modules/release/constants/release.fields.ts
export const ReleaseFields = {
	// basic fields
	ID: 'release.id',
	UPC: 'release.upc',
	TITLE: 'release.title',
	VERSION: 'release.version',
	STATUS: 'release.status',

	// date
	CREATED_AT: 'release.createdAt',
	UPDATED_AT: 'release.updatedAt',

	// genre & label
	ALBUM_FORMAT_ID: 'release.albumFormatId',
	PRIMARY_GENRE_ID: 'release.primaryGenreId',
	SUB_GENRE_ID: 'release.subGenreId',
	LABEL_ID: 'release.labelId',

	// copyright lines
	C_LINE_YEAR: 'release.cLineYear',
	C_LINE_OWNER: 'release.cLineOwner',
	P_LINE_YEAR: 'release.pLineYear',
	P_LINE_OWNER: 'release.pLineOwner',

	// catalog & release timing
	CATALOG_ID: 'release.catalogId',
	RELEASE_TIME_MODE: 'release.releaseTimeMode',
	RELEASE_TIMEZONE_ID: 'release.releaseTimezoneId',
	RELEASE_DATE: 'release.releaseDate',
	RELEASE_TIME: 'release.releaseTime',

	// relations
	ALBUM_FORMAT: 'release.albumFormat',
	PRIMARY_GENRE: 'release.primaryGenre',
	SUB_GENRE: 'release.subGenre',
	LABEL: 'release.label',
	TRACKS: 'release.tracks',
	RELEASE_ARTISTS: 'release.releaseArtists',
	RELEASE_LANGUAGE: 'release.releaseLanguage',
	RELEASE_LOCALIZES: 'release.releaseLocalizes',
	RELEASE_COVER_ARTS: 'release.releaseCoverArts',
	RELEASE_DSP: 'release.releaseDsp',
	RELEASE_TERRITORY: 'release.releaseTerritory',

	// tenant & users
	TENANT_ID: 'release.tenantId',
	TENANT: 'release.tenant',
	CREATOR: 'release.creator',
	MODIFIER: 'release.modifier',
};

export const releaseFieldsSimple = [
	ReleaseFields.ID,
	ReleaseFields.TITLE,
	ReleaseFields.CREATED_AT,
	ReleaseFields.UPDATED_AT,
];
