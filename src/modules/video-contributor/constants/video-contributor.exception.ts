import { ResponseError } from 'src/common/dtos/common.response.dto';

export class VideoContributorException {
	static NOT_FOUND(data?: any) {
		return new ResponseError({
			data,
			message: 'Not found',
			messageCode: 'videoContributor.message.error.notFound',
			statusCode: 404,
		});
	}

	static UNIQUE_CONSTRAINT(data?: any) {
		return new ResponseError({
			data,
			message:
				'The combination of artist, role, and video must be unique.',
			messageCode: 'videoContributor.message.error.uniqueConstraint',
			statusCode: 409,
		});
	}
}
