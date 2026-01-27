// src/modules/aggregators/const/aggregator.const.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { Aggregator } from '../entities/aggregator.entity';

export class AggregatorSuccess {
	static CREATE(data?: Aggregator) {
		return new ResponseSuccess<Aggregator>({
			message: 'Create success',
			messageCode: 'aggregator.message.success.create',
			data,
		});
	}

	static UPDATE(data?: Aggregator) {
		return new ResponseSuccess<Aggregator>({
			message: 'Update success',
			messageCode: 'aggregator.message.success.update',
			data,
		});
	}

	static DELETE(data?: { id: string }) {
		return new ResponseSuccess<{ id: string }>({
			message: 'Delete success',
			messageCode: 'aggregator.message.success.delete',
			data,
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
