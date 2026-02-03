export const TimezoneMessageCodeSuccess = {
	CREATE: 'timezone.message.success.create',
	UPDATE: 'timezone.message.success.update',
	DELETE: 'timezone.message.success.delete',
};

export const TimezoneMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const TimezoneMessageCodeError = {
	NOT_FOUND: 'timezone.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'timezone.message.error.cannotDeleteBecauseLinkedReleases',
};

const TimezoneMessageError = {
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this timezone because it is linked to releases.',
};

export const TimezoneMessages = {
	NOT_FOUND: {
		message: TimezoneMessageError.NOT_FOUND,
		messageCode: TimezoneMessageCodeError.NOT_FOUND,
		statusCode: 404,
	},

	CANNOT_DELETE_BECAUSE_LINKED_RELEASES: {
		message: TimezoneMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		messageCode:
			TimezoneMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		statusCode: 400,
	},
};
