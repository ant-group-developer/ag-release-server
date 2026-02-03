export const NewsCategoryResponse = {
	CREATE_SUCCESS: (data: any) => ({
		data,
		message: 'Create success',
		messageCode: 'newsCategory.message.success.create',
	}),

	UPDATE_SUCCESS: (data: any) => ({
		data,
		message: 'Update success',
		messageCode: 'newsCategory.message.success.update',
	}),

	UPDATE_ORDER_SUCCESS: (data: any) => ({
		data,
		message: 'Bulk update order success',
		messageCode: 'newsCategory.message.success.bulkUpdateOrder',
	}),

	DELETE_SUCCESS: {
		message: 'Delete success',
		messageCode: 'newsCategory.message.success.delete',
	},

	NOT_FOUND: {
		message: 'Not found',
		messageCode: 'newsCategory.message.error.notFound',
		statusCode: 404,
	},

	DUPLICATE_NAME_VI: {
		message: 'Duplicate Vietnamese name',
		messageCode: 'newsCategory.message.error.duplicateNameVi',
		statusCode: 409,
	},

	DUPLICATE_NAME_EN: {
		message: 'Duplicate English name',
		messageCode: 'newsCategory.message.error.duplicateNameEn',
		statusCode: 409,
	},
};
