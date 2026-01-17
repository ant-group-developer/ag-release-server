import { ResponseSuccess } from './common/dtos/common.response.dto';

export class AppResponseSuccess {
	static COMMON<T>(data?: T) {
		return new ResponseSuccess({ data });
	}
}

export class AppException {}
