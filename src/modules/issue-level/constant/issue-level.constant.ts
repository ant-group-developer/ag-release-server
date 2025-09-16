export const IssueLevelMessageCodeSuccess = {
	CREATE: 'issueLevel.message.success.create',
	UPDATE: 'issueLevel.message.success.update',
	DELETE: 'issueLevel.message.success.delete',
	UPDATE_ORDER: 'issueLevel.message.success.updateOrder',
};

export const IssueLevelMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
	UPDATE_ORDER: 'Update order success',
};

const IssueLevelMessageCodeError = {
	NOT_FOUND: 'issueLevel.message.error.notFound',
	DUPLICATE_NAME_VI: 'issueLevel.message.error.duplicateNameVi',
	DUPLICATE_NAME_EN: 'issueLevel.message.error.duplicateNameEn',
	DUPLICATE_CODE: 'issueLevel.message.error.duplicateCode',
	CANNOT_DELETE_BECAUSE_LINKED_ISSUES:
		'issueLevel.message.error.cannotDeleteBecauseLinkedIssues',
};

const IssueLevelMessageError = {
	NOT_FOUND: 'Not found',
	DUPLICATE_NAME_VI: 'Duplicate Vietnamese name',
	DUPLICATE_NAME_EN: 'Duplicate English name',
	DUPLICATE_CODE: 'Duplicate code',
	CANNOT_DELETE_BECAUSE_LINKED_ISSUES:
		'Cannot delete this issue level because it is linked to issues',
};

export const IssueLevelMessage = {
	NOT_FOUND: {
		message: IssueLevelMessageError.NOT_FOUND,
		messageCode: IssueLevelMessageCodeError.NOT_FOUND,
		statusCode: 404,
	},

	DUPLICATE_NAME_VI: {
		message: IssueLevelMessageError.DUPLICATE_NAME_VI,
		messageCode: IssueLevelMessageCodeError.DUPLICATE_NAME_VI,
		statusCode: 409,
	},

	DUPLICATE_NAME_EN: {
		message: IssueLevelMessageError.DUPLICATE_NAME_EN,
		messageCode: IssueLevelMessageCodeError.DUPLICATE_NAME_EN,
		statusCode: 409,
	},

	DUPLICATE_CODE: {
		message: IssueLevelMessageError.DUPLICATE_CODE,
		messageCode: IssueLevelMessageCodeError.DUPLICATE_CODE,
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_ISSUES: {
		message: IssueLevelMessageError.CANNOT_DELETE_BECAUSE_LINKED_ISSUES,
		messageCode:
			IssueLevelMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_ISSUES,
		statusCode: 400,
	},
};
