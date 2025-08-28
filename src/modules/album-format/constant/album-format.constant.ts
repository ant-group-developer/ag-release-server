// data init
const albumType = {
	code: 'album',
	name: 'Album',
	minTrackCount: 1,
	maxTrackCount: 20,
};

const epType = {
	code: 'ep',
	name: 'Ep',
	minTrackCount: 1,
	maxTrackCount: 10,
};

const singleType = {
	code: 'single',
	name: 'Single',
	minTrackCount: 1,
	maxTrackCount: 1,
};

export const AlbumFormatDefault = [albumType, epType, singleType];

// messages
export const AlbumFormatMessageCodeSuccess = {
	CREATE: 'albumFormat.message.success.create',
	UPDATE: 'albumFormat.message.success.update',
	DELETE: 'albumFormat.message.success.delete',
};

export const AlbumFormatMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const AlbumFormatMessageCodeError = {
	DUPLICATE_NAME_ALBUM_FORMAT:
		'albumFormat.message.error.duplicateNameAlbumFormat',
	DUPLICATE_CODE_ALBUM_FORMAT:
		'albumFormat.message.error.duplicateCodeAlbumFormat',
	NOT_FOUND: 'albumFormat.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'albumFormat.message.error.cannotDeleteBecauseLinkedReleases',
};

const AlbumFormatMessageError = {
	DUPLICATE_NAME_ALBUM_FORMAT: 'Duplicate album format name',
	DUPLICATE_CODE_ALBUM_FORMAT: 'Duplicate album format code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this album format because it is linked to releases.',
};

export const AlbumFormatMessage = {
	NOT_FOUND: {
		message: AlbumFormatMessageError.NOT_FOUND,
		messageCode: AlbumFormatMessageCodeError.NOT_FOUND,
		statusCode: 404,
	},

	DUPLICATE_NAME_ALBUM_FORMAT: {
		message: AlbumFormatMessageError.DUPLICATE_NAME_ALBUM_FORMAT,
		messageCode: AlbumFormatMessageCodeError.DUPLICATE_NAME_ALBUM_FORMAT,
		statusCode: 409,
	},
	DUPLICATE_CODE_ALBUM_FORMAT: {
		message: AlbumFormatMessageError.DUPLICATE_CODE_ALBUM_FORMAT,
		messageCode: AlbumFormatMessageCodeError.DUPLICATE_CODE_ALBUM_FORMAT,
		statusCode: 409,
	},
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES: {
		message: AlbumFormatMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		messageCode:
			AlbumFormatMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,

		statusCode: 400,
	},
};
