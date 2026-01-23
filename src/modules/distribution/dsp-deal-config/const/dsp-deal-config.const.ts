import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class DspDealConfigSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'dspDealConfig.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'dspDealConfig.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete success',
			messageCode: 'dspDealConfig.message.success.delete',
		});
	}
}

export class DspDealConfigException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'DSP deal config not found',
			messageCode: 'dspDealConfig.message.error.notFound',
		});
	}

	static USER_ID_REQUIRED_FOR_OVERRIDE() {
		return new ResponseError({
			message: 'userId is required when scope=USER_OVERRIDE',
			messageCode: 'dspDealConfig.message.error.userIdRequired',
		});
	}

	static USER_ID_MUST_BE_NULL_FOR_GLOBAL() {
		return new ResponseError({
			message: 'userId must be null when scope=GLOBAL_DEFAULT',
			messageCode: 'dspDealConfig.message.error.userIdMustBeNull',
		});
	}

	static GLOBAL_DEFAULT_EXISTED() {
		return new ResponseError({
			message:
				'Global default config already existed for this DSP + deal type',
			messageCode: 'dspDealConfig.message.error.globalDefaultExisted',
		});
	}

	static USER_OVERRIDE_EXISTED() {
		return new ResponseError({
			message:
				'User override config already existed for this user + DSP + deal type',
			messageCode: 'dspDealConfig.message.error.userOverrideExisted',
		});
	}
}
