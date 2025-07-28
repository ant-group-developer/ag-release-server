export const GenreMessageCodeSuccess = {
	CREATE: 'genre.message.success.create',
	UPDATE: 'genre.message.success.update',
	DELETE: 'genre.message.success.delete',
};

export const GenreMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

export const GenreMessageCodeError = {
	DUPLICATE_NAME_GENRE: 'genre.message.error.duplicateNameGenre',
	NOT_FOUND: 'genre.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_RELEASES:
		'genre.message.error.cannotDeleteBecauseLinkedPrimaryReleases',
	CANNOT_DELETE_BECAUSE_LINKED_SUB_RELEASES:
		'genre.message.error.cannotDeleteBecauseLinkedSubReleases',
	CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_TRACKS:
		'genre.message.error.cannotDeleteBecauseLinkedPrimaryTracks',
	CANNOT_DELETE_BECAUSE_LINKED_SUB_TRACKS:
		'genre.message.error.cannotDeleteBecauseLinkedSubTracks',
};

export const GenreMessageError = {
	DUPLICATE_NAME_GENRE: 'Duplicate genre name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_RELEASES:
		'Cannot delete this genre because it is linked to primary releases.',
	CANNOT_DELETE_BECAUSE_LINKED_SUB_RELEASES:
		'Cannot delete this genre because it is linked to sub-genre releases.',
	CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_TRACKS:
		'Cannot delete this genre because it is linked to primary tracks.',
	CANNOT_DELETE_BECAUSE_LINKED_SUB_TRACKS:
		'Cannot delete this genre because it is linked to sub-genre tracks.',
};
