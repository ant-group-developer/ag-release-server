export const TrackOriginTypeMessageCodeSuccess = {
	CREATE: 'trackOriginType.message.success.create',
	UPDATE: 'trackOriginType.message.success.update',
	DELETE: 'trackOriginType.message.success.delete',
};

export const TrackOriginTypeMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const TrackOriginTypeMessageCodeError = {
	DUPLICATE_NAME_TRACK_ORIGIN_TYPE:
		'trackOriginType.message.error.duplicateNameTrackOriginType',

	DUPLICATE_CODE_TRACK_ORIGIN_TYPE:
		'trackOriginType.message.error.duplicateCodeTrackOriginType',
	NOT_FOUND: 'trackOriginType.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'trackOriginType.message.error.cannotDeleteBecauseLinkedTracks',
};

const TrackOriginTypeMessageError = {
	DUPLICATE_NAME_TRACK_ORIGIN_TYPE: 'Duplicate track origin type name',
	DUPLICATE_CODE_TRACK_ORIGIN_TYPE: 'Duplicate track origin type code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this track origin type because it is linked to tracks.',
};

export const TrackOriginTypeMessages = {
	NOT_FOUND: {
		message: TrackOriginTypeMessageError.NOT_FOUND,
		statusCode: 404,
	},

	DUPLICATE_NAME_TRACK_ORIGIN_TYPE: {
		messageCode:
			TrackOriginTypeMessageCodeError.DUPLICATE_NAME_TRACK_ORIGIN_TYPE,
		message: TrackOriginTypeMessageError.DUPLICATE_NAME_TRACK_ORIGIN_TYPE,
		statusCode: 409,
	},

	DUPLICATE_CODE_TRACK_ORIGIN_TYPE: {
		messageCode:
			TrackOriginTypeMessageCodeError.DUPLICATE_CODE_TRACK_ORIGIN_TYPE,
		message: TrackOriginTypeMessageError.DUPLICATE_CODE_TRACK_ORIGIN_TYPE,
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_TRACKS: {
		message:
			TrackOriginTypeMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		messageCode:
			TrackOriginTypeMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		statusCode: 400,
	},
};
