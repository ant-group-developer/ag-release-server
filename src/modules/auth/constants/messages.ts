export const AuthMessages = {
	// 401 — Unauthorized
	UNAUTHORIZED: {
		statusCode: 401,
		message: 'Authentication required.',
		messageCode: 'auth.message.error.unauthorized',
	},
	INVALID_TOKEN: {
		statusCode: 401,
		message: 'Invalid or missing access token.',
		messageCode: 'auth.message.error.invalidToken',
	},
	INVALID_TOKEN_TYPE: {
		statusCode: 401,
		message: 'Invalid token type.',
		messageCode: 'auth.message.error.invalidTokenType',
	},
	TOKEN_EXPIRED: {
		statusCode: 401,
		message: 'Access token has expired.',
		messageCode: 'auth.message.error.tokenExpired',
	},
	SESSION_EXPIRED: {
		statusCode: 401,
		message: 'Session has expired. Please sign in again.',
		messageCode: 'auth.message.error.sessionExpired',
	},

	// 403 — Forbidden (generic + permissions)
	FORBIDDEN: {
		statusCode: 403,
		message: 'You do not have permission to access this resource.',
		messageCode: 'auth.message.error.forbidden',
	},
	INSUFFICIENT_PERMISSIONS: {
		statusCode: 403,
		message: 'Insufficient permissions.',
		messageCode: 'auth.message.error.insufficientPermissions',
	},
	SYSTEM_ADMIN_ONLY: {
		statusCode: 403,
		message: 'Only system administrators can access this resource.',
		messageCode: 'auth.message.error.systemAdminOnly',
	},

	// Tenant constraints
	TENANT_OWNER_ONLY: {
		statusCode: 403,
		message: 'Only tenant owners can access this resource.',
		messageCode: 'auth.message.error.tenantOwnerOnly',
	},
	TENANT_OWNER_OR_ADMIN_ONLY: {
		statusCode: 403,
		message:
			'Only tenant owners or tenant admins can access this resource.',
		messageCode: 'auth.message.error.tenantOwnerOrAdminOnly',
	},
	TENANT_ID_REQUIRED: {
		statusCode: 400,
		message: 'Tenant identifier is required.',
		messageCode: 'auth.message.error.tenantIdRequired',
	},
	TENANT_ACCESS_DENIED: {
		statusCode: 403,
		message: 'You do not belong to this workspace.',
		messageCode: 'auth.message.error.tenantAccessDenied',
	},
	TENANT_MISMATCH: {
		statusCode: 403,
		message: 'Requested workspace does not match your session.',
		messageCode: 'auth.message.error.tenantMismatch',
	},

	// Account state
	USER_INACTIVE: {
		statusCode: 403,
		message: 'Your account is inactive.',
		messageCode: 'auth.message.error.userInactive',
	},
	ACCOUNT_LOCKED: {
		statusCode: 403,
		message: 'Your account is locked.',
		messageCode: 'auth.message.error.accountLocked',
	},
	INVALID_CREDENTIAL: {
		statusCode: 401,
		message: 'Invalid credentials.',
		messageCode: 'auth.message.error.invalidCredentials',
	},

	// MFA
	MFA_REQUIRED: {
		statusCode: 401,
		message: 'Multi-factor authentication required.',
		messageCode: 'auth.message.error.mfaRequired',
	},
	MFA_INVALID: {
		statusCode: 401,
		message: 'Invalid verification code.',
		messageCode: 'auth.message.error.mfaInvalid',
	},
} as const;

// Optional helper to include required permissions in the message at runtime
export const buildInsufficientPermissionsMessage = (perms: string[]) =>
	({
		statusCode: 403,
		message: perms.length
			? `Insufficient permissions. Required: ${perms.join(', ')}.`
			: 'Insufficient permissions.',
		messageCode: 'auth.message.error.insufficientPermissions',
	}) as const;

export type AuthMessageKey = keyof typeof AuthMessages;
