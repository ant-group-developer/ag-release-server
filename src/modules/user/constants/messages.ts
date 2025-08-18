export const UserMessages = {
	NOT_FOUND: {
		statusCode: 404,
		message: 'No user was found with the provided information',
		messageCode: 'user.message.error.notFound',
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
	},
	INVITE: {
		SUCCESS: {
			statusCode: 200,
			message: 'Invite user to workspace success',
			messageCode: 'user.message.success.invite',
		},
	},
};
