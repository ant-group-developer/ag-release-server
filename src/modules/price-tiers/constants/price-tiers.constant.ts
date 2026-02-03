export const PriceTierMessageCodeSuccess = {
	CREATE: 'priceTier.message.success.create',
	UPDATE: 'priceTier.message.success.update',
	DELETE: 'priceTier.message.success.delete',
};

export const PriceTierMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const PriceTierMessageCodeError = {
	NOT_FOUND: 'priceTier.message.error.notFound',
	CURRENCY_NOT_FOUND: 'priceTier.message.error.currencyNotFound',

	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'priceTier.message.error.cannotDeleteBecauseLinkedTracks',
};

const PriceTierMessageError = {
	NOT_FOUND: 'Price tier not found',
	CURRENCY_NOT_FOUND: 'Currency not found',
	CANNOT_DELETE_BECAUSE_LINKED_TRACKS:
		'Cannot delete this price tier because it is linked to tracks',
};

export const PriceTierMessage = {
	CURRENCY_NOT_FOUND: {
		message: PriceTierMessageError.CURRENCY_NOT_FOUND,
		messageCode: PriceTierMessageCodeError.CURRENCY_NOT_FOUND,
		statusCode: 404,
	},

	CANNOT_DELETE_BECAUSE_LINKED_TRACKS: {
		message: PriceTierMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		messageCode:
			PriceTierMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
		statusCode: 400,
	},

	NOT_FOUND: {
		message: PriceTierMessageError.NOT_FOUND,
		messageCode: PriceTierMessageCodeError.NOT_FOUND,
		statusCode: 404,
	},
};
