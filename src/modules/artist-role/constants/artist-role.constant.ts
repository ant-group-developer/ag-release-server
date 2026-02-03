export const mainArtistRole = { name: 'Main Artist', code: 'MAIN_ARTIST' };
export const dataInitArtistRole: { name: string; code: string }[] = [
	{ name: 'Main Artist', code: 'MAIN_ARTIST' },
	{ name: 'Singer', code: 'SINGER' },
	{ name: 'Composer', code: 'COMPOSER' },
	{ name: 'Lyricist', code: 'LYRICIST' },
	{ name: 'Producer', code: 'PRODUCER' },
	{ name: 'Arranger', code: 'ARRANGER' },
	{ name: 'Featured Artist', code: 'FEATURED_ARTIST' },
	{ name: 'Conductor', code: 'CONDUCTOR' },
	{ name: 'Instrumentalist', code: 'INSTRUMENTALIST' },
	{ name: 'Background Vocalist', code: 'BACKGROUND_VOCALIST' },
];

export const ArtistRoleMessageCodeSuccess = {
	CREATE: 'artistRole.message.success.create',
	UPDATE: 'artistRole.message.success.update',
	DELETE: 'artistRole.message.success.delete',
};

export const ArtistRoleMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const ArtistRoleMessageCodeError = {
	DUPLICATE_NAME_ARTIST_ROLE:
		'artistRole.message.error.duplicateNameArtistRole',
	DUPLICATE_CODE_ARTIST_ROLE:
		'artistRole.message.error.duplicateCodeArtistRole',
	NOT_FOUND: 'artistRole.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'artistRole.message.error.cannotDeleteBecauseLinkedReleases',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'artistRole.message.error.cannotDeleteBecauseLinkedTracks',
};

const ArtistRoleMessageError = {
	DUPLICATE_NAME_ARTIST_ROLE: 'Duplicate artist role name',
	DUPLICATE_CODE_ARTIST_ROLE: 'Duplicate artist role code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this artist role because it is linked to releases.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this artist role because it is linked to tracks.',
};

export const ArtistRoleMessage = {
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES: {
		message: ArtistRoleMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		messageCode:
			ArtistRoleMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		statusCode: 400,
	},
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS: {
		message: ArtistRoleMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		messageCode:
			ArtistRoleMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		statusCode: 400,
	},

	DUPLICATE_NAME_ARTIST_ROLE: {
		message: ArtistRoleMessageError.DUPLICATE_NAME_ARTIST_ROLE,
		messageCode: ArtistRoleMessageCodeError.DUPLICATE_NAME_ARTIST_ROLE,
		statusCode: 409,
	},

	DUPLICATE_CODE_ARTIST_ROLE: {
		message: ArtistRoleMessageError.DUPLICATE_CODE_ARTIST_ROLE,
		messageCode: ArtistRoleMessageCodeError.DUPLICATE_CODE_ARTIST_ROLE,
		statusCode: 409,
	},
};
