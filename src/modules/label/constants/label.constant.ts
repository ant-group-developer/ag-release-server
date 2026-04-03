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
	DUPLICATE_CODE_LABEL: 'label.message.error.duplicateCodeLabel',
	NOT_FOUND: 'label.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'label.message.error.cannotDeleteBecauseLinkedReleases',
};

const LabelMessageError = {
	DUPLICATE_NAME_LABEL: 'Duplicate label name',
	DUPLICATE_CODE_LABEL: 'Duplicate label code',
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

	DUPLICATE_CODE_LABEL: {
		message: LabelMessageError.DUPLICATE_CODE_LABEL,
		messageCode: LabelMessageCodeError.DUPLICATE_CODE_LABEL,
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_RELEASES: {
		message: LabelMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		messageCode:
			LabelMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		statusCode: 400,
	},

	LIMIT_EXCEEDED: {
		statusCode: 403,
		message:
			'You have reached the maximum number of labels allowed for this workspace.',
		messageCode: 'label.message.error.limitExceeded',
	},

	SYSTEM_TENANT_FORBIDDEN: {
		statusCode: 403,
		message: 'System tenant cannot create labels.',
		messageCode: 'label.message.error.systemTenantForbidden',
	},
};
