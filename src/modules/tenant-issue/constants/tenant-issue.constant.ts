export const TenantIssueResponse = {
	CREATE_SUCCESS: (data: any) => ({
		data,
		message: 'Create success',
		messageCode: 'tenantIssue.message.success.create',
	}),

	UPDATE_SUCCESS: (data: any) => ({
		data,
		message: 'Update success',
		messageCode: 'tenantIssue.message.success.update',
	}),

	DELETE_SUCCESS: {
		message: 'Delete success',
		messageCode: 'tenantIssue.message.success.delete',
	},

	NOT_FOUND: {
		message: 'Tenant issue not found',
		messageCode: 'tenantIssue.message.error.notFound',
		statusCode: 404,
	},

	DUPLICATE: {
		message: 'This tenant already has this issue active',
		messageCode: 'tenantIssue.message.error.duplicate',
		statusCode: 409,
	},

	TENANT_NOT_FOUND: {
		message: 'Tenant not found',
		messageCode: 'tenantIssue.message.error.tenantNotFound',
		statusCode: 404,
	},

	ISSUE_NOT_FOUND: {
		message: 'Issue not found',
		messageCode: 'tenantIssue.message.error.issueNotFound',
		statusCode: 404,
	},
};
