// src/modules/distribution/system-settings/const/system-settings.const.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class SystemSettingsSuccess {
	static UPSERT<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Upsert success',
			messageCode: 'systemSettings.message.success.upsert',
			data,
		});
	}

	static DELETE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Delete success',
			messageCode: 'systemSettings.message.success.delete',
			data,
		});
	}

	static DETAIL<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get detail success',
			messageCode: 'systemSettings.message.success.detail',
			data,
		});
	}

	static LIST<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get list success',
			messageCode: 'systemSettings.message.success.list',
			data,
		});
	}
}

export class SystemSettingsException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'System setting not found',
			messageCode: 'systemSettings.message.error.notFound',
		});
	}
}
