export const TenantTierMessageCodeSuccess = {
	CREATE: 'tenantTier.message.success.create',
	UPDATE: 'tenantTier.message.success.update',
	DELETE: 'tenantTier.message.success.delete',
};

export const TenantTierMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const TenantTierMessageCodeError = {
	NOT_FOUND: 'tenantTier.message.error.notFound',
	DUPLICATE_NAME_VI: 'tenantTier.message.error.duplicateNameVi',
	DUPLICATE_NAME_EN: 'tenantTier.message.error.duplicateNameEn',
	DUPLICATE_CODE: 'tenantTier.message.error.duplicateCode',
};

const TenantTierMessageError = {
	NOT_FOUND: 'Not found',
	DUPLICATE_NAME_VI: 'Duplicate Vietnamese name',
	DUPLICATE_NAME_EN: 'Duplicate English name',
	DUPLICATE_CODE: 'Duplicate code',
};

export const TenantTierMessage = {
	NOT_FOUND: {
		message: TenantTierMessageError.NOT_FOUND,
		messageCode: TenantTierMessageCodeError.NOT_FOUND,
		statusCode: 404,
	},
	DUPLICATE_NAME_VI: {
		message: TenantTierMessageError.DUPLICATE_NAME_VI,
		messageCode: TenantTierMessageCodeError.DUPLICATE_NAME_VI,
		statusCode: 409,
	},
	DUPLICATE_NAME_EN: {
		message: TenantTierMessageError.DUPLICATE_NAME_EN,
		messageCode: TenantTierMessageCodeError.DUPLICATE_NAME_EN,
		statusCode: 409,
	},
	DUPLICATE_CODE: {
		message: TenantTierMessageError.DUPLICATE_CODE,
		messageCode: TenantTierMessageCodeError.DUPLICATE_CODE,
		statusCode: 409,
	},
};
