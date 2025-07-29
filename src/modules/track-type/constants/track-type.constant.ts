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

export const TrackTypeMessageCodeError = {
	DUPLICATE_NAME_TRACK_TYPE: 'trackType.message.error.duplicateNameTrackType',
	NOT_FOUND: 'trackType.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'trackType.message.error.cannotDeleteBecauseLinkedTracks',
};

export const TrackTypeMessageError = {
	DUPLICATE_NAME_TRACK_TYPE: 'Duplicate trackType name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this track type because it is linked to tracks.',
};
