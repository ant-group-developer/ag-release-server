export const NewsPostResponse = {
	CREATE_SUCCESS: (data: any) => ({
		data,
		message: 'Create success',
		messageCode: 'newsPost.message.success.create',
	}),

	UPDATE_SUCCESS: (data: any) => ({
		data,
		message: 'Update success',
		messageCode: 'newsPost.message.success.update',
	}),

	DELETE_SUCCESS: {
		message: 'Delete success',
		messageCode: 'newsPost.message.success.delete',
	},

	NOT_FOUND: {
		message: 'Not found',
		messageCode: 'newsPost.message.error.notFound',
		statusCode: 404,
	},

	DUPLICATE_SLUG: {
		message: 'Duplicate slug',
		messageCode: 'newsPost.message.error.duplicateSlug',
		statusCode: 409,
	},

	CATEGORY_NOT_FOUND: {
		message: 'News category not found',
		messageCode: 'newsPost.message.error.categoryNotFound',
		statusCode: 404,
	},
};
