import { ResponseError } from 'src/common/dtos/common.response.dto';

export class ReleaseContributorException {
	static NOT_FOUND(data?: any) {
		return new ResponseError({
			data,
			message: 'Not found',
			messageCode: 'releaseContributor.message.error.notFound',
		});
	}

	static ARTIST_ROLE_NOT_FOUND(data?: any) {
		return new ResponseError({
			data,
			message: 'Artist role not found',
			messageCode: 'releaseContributor.message.error.artistRoleNotFound',
		});
	}

	static ARTIST_NOT_FOUND(data?: any) {
		return new ResponseError({
			data,
			message: 'Artist not found',
			messageCode: 'releaseContributor.message.error.artistNotFound',
		});
	}

	static RELEASE_NOT_FOUND(data?: any) {
		return new ResponseError({
			data,
			message: 'Release not found',
			messageCode: 'releaseContributor.message.error.releaseNotFound',
		});
	}

	static UNIQUE_CONSTRAINT(data?: any) {
		return new ResponseError({
			data,
			message:
				'The combination of artist, role, and release must be unique.',
			messageCode: 'releaseContributor.message.error.uniqueConstraint',
		});
	}
}
