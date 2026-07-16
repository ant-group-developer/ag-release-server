export const TenantDomainMessages = {
	NOT_FOUND: {
		statusCode: 404,
		message: 'No custom domain was found for this tenant',
		messageCode: 'tenant_domain.error.notFound',
	},
	DOMAIN_TAKEN: {
		statusCode: 409,
		message: 'This domain is already in use by another tenant',
		messageCode: 'tenant_domain.error.domainTaken',
	},
	ALREADY_HAS_DOMAIN: {
		statusCode: 409,
		message: 'This tenant already has a custom domain configured',
		messageCode: 'tenant_domain.error.alreadyHasDomain',
	},
	INVALID_DOMAIN_FORMAT: {
		statusCode: 400,
		message: 'Invalid domain format',
		messageCode: 'tenant_domain.error.invalidFormat',
	},
	CF_OAUTH_INVALID_STATE: {
		statusCode: 400,
		message: 'Invalid or expired OAuth state',
		messageCode: 'tenant_domain.error.oauthInvalidState',
	},
	CF_OAUTH_NOT_AVAILABLE: {
		statusCode: 409,
		message:
			'Auto setup is not available for a domain that is already active or verifying',
		messageCode: 'tenant_domain.error.oauthNotAvailable',
	},
	DOMAIN_RESTRICTED: {
		statusCode: 403,
		message: 'Your account does not have access to this workspace',
		messageCode: 'auth.domain_restricted',
	},
	WHITE_LABEL_ONLY: {
		statusCode: 403,
		message: 'Custom domains are only available for white-label tenants',
		messageCode: 'tenant_domain.error.whiteLabelOnly',
	},
};
