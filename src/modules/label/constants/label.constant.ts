export const LabelMessageCodeSuccess = {
	CREATE: 'label.message.success.create',
	UPDATE: 'label.message.success.update',
	DELETE: 'label.message.success.delete',
};

export const LabelMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const LabelMessageCodeError = {
	DUPLICATE_NAME_LABEL: 'label.message.error.duplicateNameLabel',
	NOT_FOUND: 'label.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'label.message.error.cannotDeleteBecauseLinkedReleases',
};

const LabelMessageError = {
	DUPLICATE_NAME_LABEL: 'Duplicate label name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this label because it is linked to release(s).',
};

export const LabelMessage = {
	NOT_FOUND: {
		message: LabelMessageCodeError.NOT_FOUND,
	},

	DUPLICATE_NAME_LABEL: {
		message: LabelMessageError.DUPLICATE_NAME_LABEL,
		messageCode: LabelMessageCodeError.DUPLICATE_NAME_LABEL,
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_RELEASES: {
		message: LabelMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		messageCode:
			LabelMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		statusCode: 400,
	},
};
