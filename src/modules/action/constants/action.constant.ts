export const ActionMessageCodeSuccess = {
	CREATE: 'actions.message.success.create',
	UPDATE: 'actions.message.success.update',
	DELETE: 'actions.message.success.delete',
};

export const ActionMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

export const ActionMessageCodeError = {
	DUPLICATE_NAME_ACTION: 'actions.message.error.duplicateNameAction',
	DUPLICATE_CODE_ACTION: 'actions.message.error.duplicateCodeAction',
	NOT_FOUND: 'actions.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS:
		'actions.message.error.cannotDeleteBecauseLinkedDspActions',
};

export const ActionMessageError = {
	DUPLICATE_NAME_ACTION: 'Duplicate action name',
	DUPLICATE_CODE_ACTION: 'Duplicate action code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS:
		'Cannot delete this action because it is linked to dspActions',
};
