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

const GenreMessageCodeError = {
	DUPLICATE_NAME_GENRE: 'genre.message.error.duplicateNameGenre',
	DUPLICATE_CODE_GENRE: 'genre.message.error.duplicateCodeGenre',
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

const GenreMessageError = {
	DUPLICATE_NAME_GENRE: 'Duplicate genre name',
	DUPLICATE_CODE_GENRE: 'Duplicate genre code',
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

export const GenreMessage = {
	NOT_FOUND: {
		message: GenreMessageError.NOT_FOUND,
		statusCode: 404,
	},

	DUPLICATE_NAME_GENRE: {
		messageCode: GenreMessageCodeError.DUPLICATE_NAME_GENRE,
		message: GenreMessageError.DUPLICATE_NAME_GENRE,
	},

	DUPLICATE_CODE_GENRE: {
		messageCode: GenreMessageCodeError.DUPLICATE_CODE_GENRE,
		message: GenreMessageError.DUPLICATE_CODE_GENRE,
	},

	CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_RELEASES: {
		message:
			GenreMessageError.CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_RELEASES,
		messageCode:
			GenreMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_RELEASES,
		statusCode: 400,
	},

	CANNOT_DELETE_BECAUSE_LINKED_SUB_RELEASES: {
		message: GenreMessageError.CANNOT_DELETE_BECAUSE_LINKED_SUB_RELEASES,
		messageCode:
			GenreMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_SUB_RELEASES,
		statusCode: 400,
	},

	CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_TRACKS: {
		message: GenreMessageError.CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_TRACKS,
		messageCode:
			GenreMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_TRACKS,
		statusCode: 400,
	},

	CANNOT_DELETE_BECAUSE_LINKED_SUB_TRACKS: {
		message: GenreMessageError.CANNOT_DELETE_BECAUSE_LINKED_SUB_TRACKS,
		messageCode:
			GenreMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_SUB_TRACKS,
		statusCode: 400,
	},
};
