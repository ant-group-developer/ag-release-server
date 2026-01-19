import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class UserDspDealSelectionSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'userDspDealSelection.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'userDspDealSelection.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete success',
			messageCode: 'userDspDealSelection.message.success.delete',
		});
	}
}

export class UserDspDealSelectionException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'User DSP deal selection not found',
			messageCode: 'userDspDealSelection.message.error.notFound',
		});
	}

	static ALREADY_EXISTS() {
		return new ResponseError({
			message: 'Selection already existed for this user + DSP',
			messageCode: 'userDspDealSelection.message.error.alreadyExists',
		});
	}

	static OVERRIDE_REQUIRED() {
		return new ResponseError({
			message: 'overrideConfigId is required when mode=USE_OVERRIDE',
			messageCode: 'userDspDealSelection.message.error.overrideRequired',
		});
	}

	static OVERRIDE_MUST_BE_NULL() {
		return new ResponseError({
			message: 'overrideConfigId must be null when mode=USE_DEFAULT',
			messageCode:
				'userDspDealSelection.message.error.overrideMustBeNull',
		});
	}

	static INVALID_OVERRIDE_CONFIG() {
		return new ResponseError({
			message:
				'overrideConfigId is invalid for this user + dsp + deal type',
			messageCode:
				'userDspDealSelection.message.error.invalidOverrideConfig',
		});
	}
}
