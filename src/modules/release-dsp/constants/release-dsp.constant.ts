// const/release-dsp-delivery.constant.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class ReleaseDspDeliverySuccess {
	static CREATE<T>(data: T) {
		return new ResponseSuccess({
			message: 'Create release dsp delivery success',
			messageCode: 'releaseDspDelivery.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data: T) {
		return new ResponseSuccess({
			message: 'Update release dsp delivery success',
			messageCode: 'releaseDspDelivery.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete release dsp delivery success',
			messageCode: 'releaseDspDelivery.message.success.delete',
		});
	}
}

export class ReleaseDspDeliveryException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Release dsp delivery not found',
			messageCode: 'releaseDspDelivery.message.error.notFound',
		});
	}

	static DUPLICATED() {
		return new ResponseError({
			message: 'Release dsp delivery already existed',
			messageCode: 'releaseDspDelivery.message.error.duplicated',
		});
	}
}
