enum NameAlbumDefault {
	ALBUM = 'Album',
	EP = 'Ep',
	SINGLE = 'Single',
}

enum ValueAlbumDefault {
	ALBUM = 'album',
	EP = 'ep',
	SINGLE = 'single',
}

export const AlbumFormatDefault = [
	{
		value: ValueAlbumDefault.ALBUM,
		name: NameAlbumDefault.ALBUM,
		minTrackCount: 1,
		maxTrackCount: 20,
	},
	{
		value: ValueAlbumDefault.EP,
		name: NameAlbumDefault.EP,
		minTrackCount: 1,
		maxTrackCount: 10,
	},
	{
		value: ValueAlbumDefault.SINGLE,
		name: NameAlbumDefault.SINGLE,
		minTrackCount: 1,
		maxTrackCount: 10,
	},
];

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

export const AlbumFormatMessageCodeError = {
	DUPLICATE_NAME_ALBUM_FORMAT:
		'albumFormat.message.error.duplicateNameAlbumFormat',
	DUPLICATE_VALUE_ALBUM_FORMAT:
		'albumFormat.message.error.duplicateValueAlbumFormat',
	NOT_FOUND: 'albumFormat.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'albumFormat.message.error.cannotDeleteBecauseLinkedReleases',
};

export const AlbumFormatMessageError = {
	DUPLICATE_NAME_ALBUM_FORMAT: 'Duplicate album format name',
	DUPLICATE_VALUE_ALBUM_FORMAT: 'Duplicate album format value',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this album format because it is linked to releases.',
};
