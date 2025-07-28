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

export const TrackOriginTypeMessageCodeError = {
	DUPLICATE_NAME_TRACK_ORIGIN_TYPE:
		'trackOriginType.message.error.duplicateNameTrackOriginType',

	DUPLICATE_VALUE_TRACK_ORIGIN_TYPE:
		'trackOriginType.message.error.duplicateValueTrackOriginType',
	NOT_FOUND: 'trackOriginType.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'trackOriginType.message.error.cannotDeleteBecauseLinkedTracks',
};

export const TrackOriginTypeMessageError = {
	DUPLICATE_NAME_TRACK_ORIGIN_TYPE: 'Duplicate trackOriginType name',
	DUPLICATE_VALUE_TRACK_ORIGIN_TYPE: 'Duplicate trackOriginType value',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this track origin type because it is linked to tracks.',
};
