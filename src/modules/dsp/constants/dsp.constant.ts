export const DspMessageCodeSuccess = {
	CREATE: 'dsp.message.success.create',
	UPDATE: 'dsp.message.success.update',
	DELETE: 'dsp.message.success.delete',
};

export const DspMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const DspMessageCodeError = {
	DUPLICATE_NAME_DSP: 'dsp.message.error.duplicateNameDsp',
	NOT_FOUND: 'dsp.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'dsp.message.error.cannotDeleteBecauseLinkedReleases',
};

const DspMessageError = {
	DUPLICATE_NAME_DSP: 'Duplicate DSP name',
	NOT_FOUND: 'Dsp not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this DSP because it is linked to releases.',
};

export const DspMessage = {
	NOT_FOUND: {
		message: DspMessageCodeError.NOT_FOUND,
	},

	DUPLICATE_NAME_DSP: {
		message: DspMessageError.DUPLICATE_NAME_DSP,
		messageCode: DspMessageCodeError.DUPLICATE_NAME_DSP,
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_RELEASES: {
		message: DspMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		messageCode: DspMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
		statusCode: 400,
	},
};
