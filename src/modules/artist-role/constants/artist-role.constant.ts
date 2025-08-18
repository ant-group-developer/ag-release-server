export const mainArtistRole = { name: 'Main Artist', code: 'main_artist' };

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

export const ArtistRoleMessageCodeError = {
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

export const ArtistRoleMessageError = {
	DUPLICATE_NAME_ARTIST_ROLE: 'Duplicate artist role name',
	DUPLICATE_CODE_ARTIST_ROLE: 'Duplicate artist role code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this artist role because it is linked to releases.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this artist role because it is linked to tracks.',
};
