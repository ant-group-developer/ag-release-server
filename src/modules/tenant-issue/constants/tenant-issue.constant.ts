export const TenantIssueMessageCodeSuccess = {
	CREATE: 'tenantIssue.message.success.create',
	UPDATE: 'tenantIssue.message.success.update',
	DELETE: 'tenantIssue.message.success.delete',
};

export const TenantIssueMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const TenantIssueMessageCodeError = {
	NOT_FOUND: 'tenantIssue.message.error.notFound',
	DUPLICATE: 'tenantIssue.message.error.duplicate',
	TENANT_NOT_FOUND: 'tenantIssue.message.error.tenantNotFound',
	ISSUE_NOT_FOUND: 'tenantIssue.message.error.issueNotFound',
};

const TenantIssueMessageError = {
	NOT_FOUND: 'Tenant issue not found',
	DUPLICATE: 'This tenant already has this issue active',
	TENANT_NOT_FOUND: 'Tenant not found',
	ISSUE_NOT_FOUND: 'Issue not found',
};

export const TenantIssueMessage = {
	NOT_FOUND: {
		message: TenantIssueMessageError.NOT_FOUND,
		messageCode: TenantIssueMessageCodeError.NOT_FOUND,
		statusCode: 404,
	},
	DUPLICATE: {
		message: TenantIssueMessageError.DUPLICATE,
		messageCode: TenantIssueMessageCodeError.DUPLICATE,
		statusCode: 409,
	},
	TENANT_NOT_FOUND: {
		message: TenantIssueMessageError.TENANT_NOT_FOUND,
		messageCode: TenantIssueMessageCodeError.TENANT_NOT_FOUND,
		statusCode: 404,
	},
	ISSUE_NOT_FOUND: {
		message: TenantIssueMessageError.ISSUE_NOT_FOUND,
		messageCode: TenantIssueMessageCodeError.ISSUE_NOT_FOUND,
		statusCode: 404,
	},
};
