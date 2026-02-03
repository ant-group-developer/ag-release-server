export const TrackTypeMessageCodeSuccess = {
	CREATE: 'trackType.message.success.create',
	UPDATE: 'trackType.message.success.update',
	DELETE: 'trackType.message.success.delete',
};

export const TrackTypeMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const TrackTypeMessageCodeError = {
	DUPLICATE_NAME_TRACK_TYPE: 'trackType.message.error.duplicateNameTrackType',
	DUPLICATE_CODE_TRACK_TYPE: 'trackType.message.error.duplicateCodeTrackType',
	NOT_FOUND: 'trackType.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'trackType.message.error.cannotDeleteBecauseLinkedTracks',
};

const TrackTypeMessageError = {
	DUPLICATE_NAME_TRACK_TYPE: 'Duplicate track type name',
	DUPLICATE_CODE_TRACK_TYPE: 'Duplicate track type code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this track type because it is linked to tracks.',
};

export const TrackTypeMessages = {
	NOT_FOUND: {
		message: TrackTypeMessageError.NOT_FOUND,
		statusCode: 404,
	},

	DUPLICATE_NAME_TRACK_TYPE: {
		messageCode: TrackTypeMessageCodeError.DUPLICATE_NAME_TRACK_TYPE,
		message: TrackTypeMessageError.DUPLICATE_NAME_TRACK_TYPE,
		statusCode: 409,
	},

	DUPLICATE_CODE_TRACK_TYPE: {
		messageCode: TrackTypeMessageCodeError.DUPLICATE_CODE_TRACK_TYPE,
		message: TrackTypeMessageError.DUPLICATE_CODE_TRACK_TYPE,
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_TRACKS: {
		message: TrackTypeMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		messageCode:
			TrackTypeMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		statusCode: 400,
	},
};
