export const UserMessages = {
	NOT_FOUND: {
		statusCode: 404,
		message: 'No user was found with the provided information',
		messageCode: 'user.message.error.notFound',
	},
	BLOCKED: {
		statusCode: 403,
		message: 'User has been blocked',
		messageCode: 'user.message.error.blocked',
	},
	EMAIL: {
		CONFLICT: {
			statusCode: 409,
			message: 'This email address is already registered',
			messageCode: 'user.message.error.email.conflict',
		},
	},
	TENANT: {
		CONFLICT: {
			statusCode: 409,
			message: 'User already belongs to this workspace',
			messageCode: 'user.message.error.tenant.conflict',
		},
		FORBIDDEN: {
			statusCode: 404,
			message: 'User does not belong to this workspace',
			messageCode: 'user.message.error.tenant.forbidden',
		},
		NOT_FOUND: {
			statusCode: 404,
			message: 'User does not belong to any workspace',
			messageCode: 'user.message.error.tenant.notFound',
		},
		DELETE: {
			DECLINE_DELETE_SYSTEM_ADMIN: {
				statusCode: 403,
				message: 'Cannot delete system admin',
				messageCode:
					'user.message.error.tenant.delete.declineDeleteSystemAdmin',
			},
			DECLINE_DELETE_TENANT_OWNER: {
				statusCode: 403,
				message: 'Cannot delete tenant owner',
				messageCode:
					'user.message.error.tenant.delete.declineDeleteTenantOwner',
			},
			DECLINE_DELETE_TENANT_ADMIN: {
				statusCode: 403,
				message: 'You do not have permission to delete tenant admin',
				messageCode:
					'user.message.error.tenant.delete.declineDeleteTenantAdmin',
			},
		},
	},
	INVITE: {
		SUCCESS: {
			statusCode: 200,
			message: 'Invite user to workspace success',
			messageCode: 'user.message.success.invite',
		},
	},
};
