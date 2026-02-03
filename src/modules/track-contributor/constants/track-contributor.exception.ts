import { ResponseError } from 'src/common/dtos/common.response.dto';

export class TrackContributorException {
	static CREATE_SUCCESS(data?: any) {
		return new ResponseError({
			data,
			message: 'Create success',
			messageCode: 'trackContributor.message.success.create',
		});
	}

	static UPDATE_SUCCESS(data?: any) {
		return new ResponseError({
			data,
			message: 'Update success',
			messageCode: 'trackContributor.message.success.update',
		});
	}

	static DELETE_SUCCESS(data?: any) {
		return new ResponseError({
			data,
			message: 'Delete success',
			messageCode: 'trackContributor.message.success.delete',
		});
	}

	static NOT_FOUND(data?: any) {
		return new ResponseError({
			data,
			message: 'Not found',
			messageCode: 'trackContributor.message.error.notFound',
		});
	}

	static UNIQUE_CONSTRAINT(data?: any) {
		return new ResponseError({
			data,
			message:
				'The combination of artist, role, and track must be unique.',
			messageCode: 'trackContributor.message.error.uniqueConstraint',
		});
	}
}
