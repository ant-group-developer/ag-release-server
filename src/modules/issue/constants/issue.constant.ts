export const IssueResponse = {
	CREATE_SUCCESS: (data: any) => ({
		data,
		message: 'Create success',
		messageCode: 'issue.message.success.create',
	}),

	UPDATE_SUCCESS: (data: any) => ({
		data,
		message: 'Update success',
		messageCode: 'issue.message.success.update',
	}),

	DELETE_SUCCESS: {
		message: 'Delete success',
		messageCode: 'issue.message.success.delete',
	},

	NOT_FOUND: {
		message: 'Not found',
		messageCode: 'issue.message.error.notFound',
		statusCode: 404,
	},
	DUPLICATE_NAME_VI: {
		message: 'Duplicate Vietnamese name',
		messageCode: 'issue.message.error.duplicateNameVi',
		statusCode: 409,
	},
	DUPLICATE_NAME_EN: {
		message: 'Duplicate English name',
		messageCode: 'issue.message.error.duplicateNameEn',
		statusCode: 409,
	},
	DUPLICATE_CODE: {
		message: 'Duplicate code',
		messageCode: 'issue.message.error.duplicateCode',
		statusCode: 409,
	},
	ISSUE_LEVEL_NOT_FOUND: {
		message: 'Issue level not found',
		messageCode: 'issue.message.error.issueLevelNotFound',
		statusCode: 404,
	},
};
