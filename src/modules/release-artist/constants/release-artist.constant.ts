export const ReleaseArtistMessageCodeSuccess = {
	CREATE: 'releaseArtist.message.success.create',
	UPDATE: 'releaseArtist.message.success.update',
	DELETE: 'releaseArtist.message.success.delete',
};

export const ReleaseArtistMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const ReleaseArtistMessageCodeError = {
	NOT_FOUND: 'releaseArtist.message.error.notFound',
	ARTIST_ROLE_NOT_FOUND: 'releaseArtist.message.error.artistRoleNotFound',
	ARTIST_NOT_FOUND: 'releaseArtist.message.error.artistNotFound',
	RELEASE_NOT_FOUND: 'releaseArtist.message.error.releaseNotFound',
	UNIQUE_CONSTRAINT: 'releaseArtist.message.error.uniqueConstraint',
};

const ReleaseArtistMessageError = {
	NOT_FOUND: 'Not found',
	ARTIST_ROLE_NOT_FOUND: 'Artist role not found',
	ARTIST_NOT_FOUND: 'Artist not found',
	RELEASE_NOT_FOUND: 'Release not found',
	UNIQUE_CONSTRAINT:
		'The combination of artist, role, and release must be unique.',
};

export const ReleaseArtistMessage = {
	NOT_FOUND: {
		message: ReleaseArtistMessageError.NOT_FOUND,
		statusCode: 404,
	},

	ARTIST_ROLE_NOT_FOUND: {
		message: ReleaseArtistMessageError.ARTIST_ROLE_NOT_FOUND,
		messageCode: ReleaseArtistMessageCodeError.ARTIST_ROLE_NOT_FOUND,
	},
	ARTIST_NOT_FOUND: {
		message: ReleaseArtistMessageError.ARTIST_NOT_FOUND,
		messageCode: ReleaseArtistMessageCodeError.ARTIST_NOT_FOUND,
	},
	RELEASE_NOT_FOUND: {
		message: ReleaseArtistMessageError.RELEASE_NOT_FOUND,
		messageCode: ReleaseArtistMessageCodeError.RELEASE_NOT_FOUND,
	},
	UNIQUE_CONSTRAINT: {
		message: ReleaseArtistMessageError.UNIQUE_CONSTRAINT,
		messageCode: ReleaseArtistMessageCodeError.UNIQUE_CONSTRAINT,
	},
};
