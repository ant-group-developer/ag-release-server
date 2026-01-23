// src/modules/distribution/delivery-config/const/delivery-config.const.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class DeliveryConfigSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'deliveryConfig.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'deliveryConfig.message.success.update',
			data,
		});
	}

	static DELETE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Delete success',
			messageCode: 'deliveryConfig.message.success.delete',
			data,
		});
	}

	static DETAIL<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get detail success',
			messageCode: 'deliveryConfig.message.success.detail',
			data,
		});
	}

	static LIST<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get list success',
			messageCode: 'deliveryConfig.message.success.list',
			data,
		});
	}
}

export class DeliveryConfigException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Delivery config not found',
			messageCode: 'deliveryConfig.message.error.notFound',
		});
	}

	static NAME_EXISTED() {
		return new ResponseError({
			statusCode: 400,
			message: 'Delivery config name already existed',
			messageCode: 'deliveryConfig.message.error.nameExisted',
		});
	}

	static INVALID_PROVIDER_CODE() {
		return new ResponseError({
			statusCode: 400,
			message: 'Invalid provider code',
			messageCode: 'deliveryConfig.message.error.invalidProviderCode',
		});
	}
}
