export enum FieldOrderArtist {
	NAME = 'name',
	PICTURE = 'picture',
	// DESCRIPTION = 'description',
	BIOGRAPHY = 'biography',
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',

	// virtual
	TRACK_COUNT = 'track_count',
	RELEASE_COUNT = 'release_count',
}

export enum VirtualColumnsArtist {
	TRACK_COUNT = FieldOrderArtist.TRACK_COUNT,
	RELEASE_COUNT = FieldOrderArtist.RELEASE_COUNT,
}

export const VirtualColumnsArtistArr = Object.values(
	VirtualColumnsArtist,
) as string[];

export enum ArtistSource {
	MUSIC_BRAINZ = 'music_brainz',
	ANT_MUSIC = 'ant_music',
	ADA = 'ada',
}
