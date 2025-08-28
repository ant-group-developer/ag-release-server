export const TrackMessageCodeSuccess = {
	CREATE: 'track.message.success.create',
	UPDATE: 'track.message.success.update',
	DELETE: 'track.message.success.delete',
};

export const TrackMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const TrackMessageCodeError = {
	NOT_FOUND: 'track.message.error.notFound',
	PRIMARY_GENRE_NOT_FOUND: 'track.message.error.primaryGenreNotFound',
	SUB_GENRE_NOT_FOUND: 'track.message.error.subGenreNotFound',
	TRACK_TYPE_NOT_FOUND: 'track.message.error.trackTypeNotFound',
	TRACK_ORIGIN_TYPE_NOT_FOUND: 'track.message.error.trackOriginTypeNotFound',
	RELEASE_NOT_FOUND: 'track.message.error.releaseNotFound',
	PRICE_TIER_NOT_FOUND: 'track.message.error.priceTierNotFound',
};

const TrackMessageError = {
	NOT_FOUND: 'Not found',
	PRIMARY_GENRE_NOT_FOUND: 'Primary genre not found',
	SUB_GENRE_NOT_FOUND: 'Sub-genre not found',
	TRACK_TYPE_NOT_FOUND: 'Track type not found',
	TRACK_ORIGIN_TYPE_NOT_FOUND: 'Track origin type not found',
	RELEASE_NOT_FOUND: 'Release not found',
	PRICE_TIER_NOT_FOUND: 'Price tier not found',
};

export const TrackMessages = {
	NOT_FOUND: {
		message: TrackMessageError.NOT_FOUND,
		statusCode: 404,
	},

	RELEASE_NOT_FOUND: {
		message: TrackMessageError.RELEASE_NOT_FOUND,
		messageCode: TrackMessageCodeError.RELEASE_NOT_FOUND,
	},
	PRIMARY_GENRE_NOT_FOUND: {
		message: TrackMessageError.PRIMARY_GENRE_NOT_FOUND,
		messageCode: TrackMessageCodeError.PRIMARY_GENRE_NOT_FOUND,
	},
	SUB_GENRE_NOT_FOUND: {
		message: TrackMessageError.SUB_GENRE_NOT_FOUND,
		messageCode: TrackMessageCodeError.SUB_GENRE_NOT_FOUND,
	},
	TRACK_TYPE_NOT_FOUND: {
		message: TrackMessageError.TRACK_TYPE_NOT_FOUND,
		messageCode: TrackMessageCodeError.TRACK_TYPE_NOT_FOUND,
	},
	TRACK_ORIGIN_TYPE_NOT_FOUND: {
		message: TrackMessageError.TRACK_ORIGIN_TYPE_NOT_FOUND,
		messageCode: TrackMessageCodeError.TRACK_ORIGIN_TYPE_NOT_FOUND,
	},

	PRICE_TIER_NOT_FOUND: {
		message: TrackMessageError.PRICE_TIER_NOT_FOUND,
		messageCode: TrackMessageCodeError.PRICE_TIER_NOT_FOUND,
	},
};
