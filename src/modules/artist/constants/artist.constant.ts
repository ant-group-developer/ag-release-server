export const ArtistMessageCodeSuccess = {
	CREATE: 'artist.message.success.create',
	UPDATE: 'artist.message.success.update',
	DELETE: 'artist.message.success.delete',
};

export const ArtistMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

export const ArtistMessageCodeError = {
	DUPLICATE_NAME_ARTIST: 'artist.message.error.duplicateNameArtist',
	NOT_FOUND: 'artist.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'artist.message.error.cannotDeleteBecauseLinkedReleases',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'artist.message.error.cannotDeleteBecauseLinkedTracks',
};

export const ArtistMessageError = {
	DUPLICATE_NAME_ARTIST: 'Duplicate artist name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this artist because it is linked to releases.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this artist because it is linked to tracks.',
};
