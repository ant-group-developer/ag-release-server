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

export const PermissionMessageCodeError = {
	DUPLICATE_NAME_PERMISSION:
		'permission.message.error.duplicateNamePermission',
	DUPLICATE_VALUE_PERMISSION:
		'permission.message.error.duplicateValuePermission',
	NOT_FOUND: 'permission.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_USERS:
		'permission.message.error.cannotDeleteBecauseLinkedUsers',
	CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS:
		'permission.message.error.cannotDeleteBecauseLinkedRolePermissions',
};

export const PermissionMessageError = {
	DUPLICATE_NAME_PERMISSION: 'Duplicate permission name',
	DUPLICATE_VALUE_PERMISSION: 'Duplicate permission value',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_USERS:
		'Cannot delete this genre because it is linked to users',
	CANNOT_DELETE_BECAUSE_LINKED_ROLE_PERMISSIONS:
		'Cannot delete this permission because it is linked to role permissions',
};
