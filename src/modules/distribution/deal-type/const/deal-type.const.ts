import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class DealTypeSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'dealType.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'dealType.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete success',
			messageCode: 'dealType.message.success.delete',
		});
	}
}

export class DealTypeException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Deal type not found',
			messageCode: 'dealType.message.error.notFound',
		});
	}

	static CODE_EXISTED() {
		return new ResponseError({
			message: 'Deal type code already existed',
			messageCode: 'dealType.message.error.codeExisted',
		});
	}

	static NAME_EXISTED() {
		return new ResponseError({
			message: 'Deal type name already existed',
			messageCode: 'dealType.message.error.nameExisted',
		});
	}
}
