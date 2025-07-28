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

export const DspMessageCodeError = {
	DUPLICATE_NAME_DSP: 'dsp.message.error.duplicateNameDsp',
	NOT_FOUND: 'dsp.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_ORGANIZATIONS:
		'dsp.message.error.cannotDeleteBecauseLinkedOrganizations',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'dsp.message.error.cannotDeleteBecauseLinkedReleases',
};

export const DspMessageError = {
	DUPLICATE_NAME_DSP: 'Duplicate DSP name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_ORGANIZATIONS:
		'Cannot delete this DSP because it is linked to organizations.',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASES:
		'Cannot delete this DSP because it is linked to releases.',
};
