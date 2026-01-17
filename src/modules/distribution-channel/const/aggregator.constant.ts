import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class AggregatorSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'aggregator.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'aggregator.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete success',
			messageCode: 'aggregator.message.success.delete',
		});
	}
}

export class AggregatorException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Aggregator not found',
			messageCode: 'aggregator.message.error.notFound',
		});
	}

	static CODE_EXISTED() {
		return new ResponseError({
			message: 'Aggregator code already existed',
			messageCode: 'aggregator.message.error.codeExisted',
		});
	}

	static NAME_EXISTED() {
		return new ResponseError({
			message: 'Aggregator name already existed',
			messageCode: 'aggregator.message.error.nameExisted',
		});
	}
}
