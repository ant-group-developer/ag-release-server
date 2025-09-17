export const IssueLevelMessage = {
	CREATE_SUCCESS: (data: any) => ({
		data,
		message: 'Create success',
		messageCode: 'issueLevel.message.success.create',
	}),

	UPDATE_SUCCESS: (data: any) => ({
		data,
		message: 'Update success',
		messageCode: 'issueLevel.message.success.update',
	}),

	DELETE_SUCCESS: {
		message: 'Delete success',
		messageCode: 'issueLevel.message.success.delete',
	},

	UPDATE_ORDER_SUCCESS: (data: any) => ({
		data,
		message: 'Update order success',
		messageCode: 'issueLevel.message.success.updateOrder',
	}),

	NOT_FOUND: {
		message: 'Not found',
		messageCode: 'issueLevel.message.error.notFound',
		statusCode: 404,
	},

	DUPLICATE_NAME_VI: {
		message: 'Duplicate Vietnamese name',
		messageCode: 'issueLevel.message.error.duplicateNameVi',
		statusCode: 409,
	},

	DUPLICATE_NAME_EN: {
		message: 'Duplicate English name',
		messageCode: 'issueLevel.message.error.duplicateNameEn',
		statusCode: 409,
	},

	DUPLICATE_CODE: {
		message: 'Duplicate code',
		messageCode: 'issueLevel.message.error.duplicateCode',
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_ISSUES: {
		message:
			'Cannot delete this issue level because it is linked to issues',
		messageCode: 'issueLevel.message.error.cannotDeleteBecauseLinkedIssues',
		statusCode: 400,
	},
};
