// src/modules/distribution/dsp-routing/const/dsp-routing.const.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class DspRoutingSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'dspRouting.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'dspRouting.message.success.update',
			data,
		});
	}

	static DELETE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Delete success',
			messageCode: 'dspRouting.message.success.delete',
			data,
		});
	}

	static DETAIL<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get detail success',
			messageCode: 'dspRouting.message.success.detail',
			data,
		});
	}

	static LIST<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get list success',
			messageCode: 'dspRouting.message.success.list',
			data,
		});
	}
}

export class DspRoutingException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'DSP routing setting not found',
			messageCode: 'dspRouting.message.error.notFound',
		});
	}

	static ALREADY_EXISTS() {
		return new ResponseError({
			statusCode: 409,
			message: 'DSP routing setting already exists',
			messageCode: 'dspRouting.message.error.alreadyExists',
		});
	}

	static DELIVERY_CONFIG_NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Delivery config not found',
			messageCode: 'dspRouting.message.error.deliveryConfigNotFound',
		});
	}

	static INVALID_MODE_CONFIG() {
		return new ResponseError({
			statusCode: 400,
			message:
				'Invalid config: DIRECT requires directConfigId and must not set specificAggregatorConfigId; AGGREGATOR must not set directConfigId',
			messageCode: 'dspRouting.message.error.invalidModeConfig',
		});
	}
}
