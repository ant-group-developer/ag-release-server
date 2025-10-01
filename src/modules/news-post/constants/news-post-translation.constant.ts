export const NewsPostTranslationResponse = {
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
};
