export const RoleMessageCodeSuccess = {
	CREATE: 'role.message.success.create',
	UPDATE: 'role.message.success.update',
	DELETE: 'role.message.success.delete',
};

export const RoleMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

export const RoleMessageCodeError = {
	DUPLICATE_NAME_ROLE: 'role.message.error.duplicateNameRole',
	NOT_FOUND: 'role.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_PERMISSIONS:
		'role.message.error.cannotDeleteBecauseLinkedPermissions',
	PERMISSION_NOT_FOUND: 'role.message.error.permissionNotFound',
};

export const RoleMessageError = {
	DUPLICATE_NAME_ROLE: 'Duplicate role name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_PERMISSIONS:
		'Cannot delete this role because it is linked to permissions.',
	PERMISSION_NOT_FOUND: 'Permission not found',
};
