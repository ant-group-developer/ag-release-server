export const TrackArtistMessageCodeSuccess = {
	CREATE: 'trackArtist.message.success.create',
	UPDATE: 'trackArtist.message.success.update',
	DELETE: 'trackArtist.message.success.delete',
};

export const TrackArtistMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const TrackArtistMessageCodeError = {
	NOT_FOUND: 'trackArtist.message.error.notFound',
	UNIQUE_CONSTRAINT: 'trackArtist.message.error.uniqueConstraint',
};

const TrackArtistMessageError = {
	NOT_FOUND: 'Not found',
	UNIQUE_CONSTRAINT:
		'The combination of artist, role, and track must be unique.',
};

export const TrackArtistMessages = {
	NOT_FOUND: {
		statusCode: 404,
		message: 'Not found',
		messageCode: TrackArtistMessageCodeError.NOT_FOUND,
	},

	UNIQUE_CONSTRAINT: {
		messageCode: TrackArtistMessageCodeError.UNIQUE_CONSTRAINT,
		message: TrackArtistMessageError.UNIQUE_CONSTRAINT,
		statusCode: 409,
	},
};
