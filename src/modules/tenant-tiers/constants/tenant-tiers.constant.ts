export const TenantTierMessage = {
	CREATE_SUCCESS: (data: any) => ({
		data,
		message: 'Create success',
		messageCode: 'tenantTier.message.success.create',
	}),

	UPDATE_SUCCESS: (data: any) => ({
		data,
		message: 'Update success',
		messageCode: 'tenantTier.message.success.update',
	}),

	DELETE_SUCCESS: {
		message: 'Delete success',
		messageCode: 'tenantTier.message.success.delete',
	},

	NOT_FOUND: {
		message: 'Not found',
		messageCode: 'tenantTier.message.error.notFound',
		statusCode: 404,
	},

	DUPLICATE_NAME_VI: {
		message: 'Duplicate Vietnamese name',
		messageCode: 'tenantTier.message.error.duplicateNameVi',
		statusCode: 409,
	},

	DUPLICATE_NAME_EN: {
		message: 'Duplicate English name',
		messageCode: 'tenantTier.message.error.duplicateNameEn',
		statusCode: 409,
	},

	DUPLICATE_CODE: {
		message: 'Duplicate code',
		messageCode: 'tenantTier.message.error.duplicateCode',
		statusCode: 409,
	},
};
