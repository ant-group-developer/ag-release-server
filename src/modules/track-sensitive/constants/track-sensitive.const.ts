export const TrackSensitiveMessage = {
	CREATE: {
		message: 'Create success',
		messageCode: 'trackSensitive.message.success.create',
		statusCode: 201,
	},
	UPDATE: {
		message: 'Update success',
		messageCode: 'trackSensitive.message.success.update',
		statusCode: 200,
	},
	DELETE: {
		message: 'Delete success',
		messageCode: 'trackSensitive.message.success.delete',
		statusCode: 200,
	},

	NOT_FOUND: {
		message: 'TrackSensitive not found',
		messageCode: 'trackSensitive.message.error.notFound',
		statusCode: 404,
	},
	DUPLICATE_NAME: {
		message: 'Duplicate trackSensitive name',
		messageCode: 'trackSensitive.message.error.duplicateName',
		statusCode: 409,
	},
	DUPLICATE_CODE: {
		message: 'Duplicate trackSensitive code',
		messageCode: 'trackSensitive.message.error.duplicateCode',
		statusCode: 409,
	},
};
