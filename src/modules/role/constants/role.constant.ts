export const RoleMessageCodeSuccess = {
	CREATE: 'roles.message.success.create',
	UPDATE: 'roles.message.success.update',
	DELETE: 'roles.message.success.delete',
};

export const RoleMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

export const RoleMessageCodeError = {
	DUPLICATE_NAME_ROLE: 'roles.message.error.duplicateNameRole',
	NOT_FOUND: 'roles.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_PERMISSIONS:
		'roles.message.error.cannotDeleteBecauseLinkedPermissions',
	PERMISSION_NOT_FOUND: 'roles.message.error.permissionNotFound',
};

export const RoleMessageError = {
	DUPLICATE_NAME_ROLE: 'Duplicate role name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_PERMISSIONS:
		'Cannot delete this role because it is linked to permissions.',
	PERMISSION_NOT_FOUND: 'Permission not found',
};
