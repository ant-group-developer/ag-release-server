export const ReleaseCoverArtMessageCodeSuccess = {
	CREATE: 'releaseCoverArt.message.success.create',
	UPDATE: 'releaseCoverArt.message.success.update',
	DELETE: 'releaseCoverArt.message.success.delete',
};

export const ReleaseCoverArtMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const ReleaseCoverArtMessageCodeError = {
	NOT_FOUND: 'releaseCoverArt.message.error.notFound',
	RELEASE_NOT_FOUND: 'releaseCoverArt.message.error.releaseNotFound',
};

const ReleaseCoverArtMessageError = {
	NOT_FOUND: 'Not found',
	RELEASE_NOT_FOUND: 'Release not found',
};

export const ReleaseCoverArtMessage = {
	RELEASE_NOT_FOUND: {
		message: ReleaseCoverArtMessageError.RELEASE_NOT_FOUND,
		messageCode: ReleaseCoverArtMessageCodeError.RELEASE_NOT_FOUND,
	},
};
