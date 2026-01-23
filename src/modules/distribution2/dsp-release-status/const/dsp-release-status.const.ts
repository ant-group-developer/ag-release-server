// src/modules/distribution/dsp-release-status/const/dsp-release-status.const.ts

import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class DspReleaseStatusException {
	static NOT_FOUND<T>(data?: T) {
		return new ResponseError({
			data,
			statusCode: 404,
			message: 'DSP release status not found',
			messageCode: 'dspReleaseStatus.message.error.notFound',
		});
	}

	static KEY_EXISTED<T>(data?: T) {
		return new ResponseError({
			data,
			statusCode: 409,
			message: 'DSP release status already existed',
			messageCode: 'dspReleaseStatus.message.error.keyExisted',
		});
	}
}

export class DspReleaseStatusSuccess {
	static CREATE<T>(data: T) {
		return new ResponseSuccess({
			data,
			message: 'Create success',
			messageCode: 'dspReleaseStatus.message.success.create',
		});
	}

	static UPDATE<T>(data: T) {
		return new ResponseSuccess({
			data,
			message: 'Update success',
			messageCode: 'dspReleaseStatus.message.success.update',
		});
	}

	static DELETE<T>(data: T) {
		return new ResponseSuccess({
			data,
			message: 'Delete success',
			messageCode: 'dspReleaseStatus.message.success.delete',
		});
	}
}
