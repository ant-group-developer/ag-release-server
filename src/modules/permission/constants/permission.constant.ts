export const PermissionMessageCodeSuccess = {
	CREATE: 'permission.message.success.create',
	UPDATE: 'permission.message.success.update',
	DELETE: 'permission.message.success.delete',
};

export const PermissionMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const PermissionMessageCodeError = {
	DUPLICATE_NAME_PERMISSION:
		'permission.message.error.duplicateNamePermission',
	DUPLICATE_CODE_PERMISSION:
		'permission.message.error.duplicateCodePermission',
	NOT_FOUND: 'permission.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_USERS:
		'permission.message.error.cannotDeleteBecauseLinkedUsers',
	CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS:
		'permission.message.error.cannotDeleteBecauseLinkedRolePermissions',
};

const PermissionMessageError = {
	DUPLICATE_NAME_PERMISSION: 'Duplicate permission name',
	DUPLICATE_CODE_PERMISSION: 'Duplicate permission code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_USERS:
		'Cannot delete this permission because it is linked to users',
	CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS:
		'Cannot delete this permission because it is linked to role permissions',
};

export const PermissionMessage = {
	DUPLICATE_NAME_PERMISSION: {
		messageCode: PermissionMessageCodeError.DUPLICATE_NAME_PERMISSION,
		message: PermissionMessageError.DUPLICATE_NAME_PERMISSION,
	},

	DUPLICATE_CODE_PERMISSION: {
		messageCode: PermissionMessageCodeError.DUPLICATE_CODE_PERMISSION,
		message: PermissionMessageError.DUPLICATE_CODE_PERMISSION,
	},

	CANNOT_DELETE_BECAUSE_LINKED_USERS: {
		message: PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_USERS,
		messageCode:
			PermissionMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_USERS,
		statusCode: 400,
	},
	CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS: {
		message:
			PermissionMessageError.CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS,
		messageCode:
			PermissionMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS,
		statusCode: 400,
	},
};
