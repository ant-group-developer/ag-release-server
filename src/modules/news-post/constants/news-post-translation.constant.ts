export const NewsPostTranslationResponseSuccess = {
	CREATE_SUCCESS: (data: any) => ({
		data,
		message: 'Create success',
		messageCode: 'newsPostTranslation.message.success.create',
	}),

	UPDATE_SUCCESS: (data: any) => ({
		data,
		message: 'Update success',
		messageCode: 'newsPostTranslation.message.success.update',
	}),

	DELETE_SUCCESS: {
		message: 'Delete success',
		messageCode: 'newsPostTranslation.message.success.delete',
	},
};

export const NewsPostTranslationResponseError = {
	NOT_FOUND: {
		message: 'Not found',
		messageCode: 'newsPostTranslation.message.error.notFound',
		statusCode: 404,
	},

	POST_NOT_FOUND: {
		message: 'News post not found',
		messageCode: 'newsPostTranslation.message.error.postNotFound',
		statusCode: 404,
	},

	LANGUAGE_NOT_FOUND: {
		message: 'Language not found',
		messageCode: 'newsPostTranslation.message.error.languageNotFound',
		statusCode: 404,
	},

	CANNOT_DELETE_DEFAULT: {
		message: 'Cannot delete default translation',
		messageCode: 'newsPostTranslation.message.error.cannotDeleteDefault',
		statusCode: 400,
	},

	UNIQUE_CONSTRAINT: {
		message: 'Translation for this news post and language already exists',
		messageCode: 'newsPostTranslation.message.error.uniqueConstraint',
		statusCode: 400,
	},

	MUST_HAVE_ONE_DEFAULT: {
		message: 'At least one translation must be set as default',
		messageCode: 'newsPostTranslation.message.error.mustHaveOneDefault',
		statusCode: 400,
	},
};
