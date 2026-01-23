import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class DspDealSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'dspDeal.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'dspDeal.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete success',
			messageCode: 'dspDeal.message.success.delete',
		});
	}
}

export class DspDealException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'DSP deal not found',
			messageCode: 'dspDeal.message.error.notFound',
		});
	}

	static UNIQUE_DSP_DEAL() {
		return new ResponseError({
			message: 'DSP already has this deal type',
			messageCode: 'dspDeal.message.error.uniqueDspDeal',
		});
	}

	static INVALID_VISIBILITY() {
		return new ResponseError({
			message: 'Invalid visibility',
			messageCode: 'dspDeal.message.error.invalidVisibility',
		});
	}
}
