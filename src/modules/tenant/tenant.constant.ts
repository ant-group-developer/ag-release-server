export const TenantMessages = {
	NOT_FOUND: {
		statusCode: 404,
		message: 'No workspace was found with the provided information',
		messageCode: 'tenant.message.error.notFound',
	},
	BLOCKED: {
		statusCode: 403,
		message: 'This workspace has been blocked',
		messageCode: 'tenant.message.error.blocked',
	},
};

export const SYSTEM_TENANT_ID = 'system-tenant';
