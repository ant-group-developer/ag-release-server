export const VideoArtistMessageCodeSuccess = {
	CREATE: 'videoArtist.message.success.create',
	UPDATE: 'videoArtist.message.success.update',
	DELETE: 'videoArtist.message.success.delete',
};

const VideoArtistMessageCodeError = {
	NOT_FOUND: 'videoArtist.message.error.notFound',
	UNIQUE_CONSTRAINT: 'videoArtist.message.error.uniqueConstraint',
};

export const VideoArtistMessages = {
	NOT_FOUND: {
		statusCode: 404,
		message: 'Not found',
		messageCode: VideoArtistMessageCodeError.NOT_FOUND,
	},

	UNIQUE_CONSTRAINT: {
		statusCode: 409,
		message: 'The combination of artist and video must be unique.',
		messageCode: VideoArtistMessageCodeError.UNIQUE_CONSTRAINT,
	},
};
