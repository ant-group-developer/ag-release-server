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

//
const ActionMessageCodeError = {
	DUPLICATE_NAME_ACTION: 'actions.message.error.duplicateNameAction',
	DUPLICATE_CODE_ACTION: 'actions.message.error.duplicateCodeAction',
	NOT_FOUND: 'actions.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS:
		'actions.message.error.cannotDeleteBecauseLinkedDspActions',
};

const ActionMessageError = {
	DUPLICATE_NAME_ACTION: 'Duplicate action name',
	DUPLICATE_CODE_ACTION: 'Duplicate action code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS:
		'Cannot delete this action because it is linked to dspActions',
};

export const ActionMessage = {
	NOT_FOUND: {
		message: ActionMessageError.NOT_FOUND,
		messageCode: ActionMessageCodeError.NOT_FOUND,
		statusCode: 404,
	},

	DUPLICATE_NAME_ACTION: {
		message: ActionMessageError.DUPLICATE_NAME_ACTION,
		messageCode: ActionMessageCodeError.DUPLICATE_NAME_ACTION,
		statusCode: 409,
	},
	DUPLICATE_CODE_ACTION: {
		message: ActionMessageError.DUPLICATE_CODE_ACTION,
		messageCode: ActionMessageCodeError.DUPLICATE_CODE_ACTION,
		statusCode: 409,
	},
	CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS: {
		message: ActionMessageError.CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS,
		messageCode:
			ActionMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS,

		statusCode: 400,
	},
};
