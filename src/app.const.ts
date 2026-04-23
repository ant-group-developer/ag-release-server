import { ResponseSuccess } from './common/dtos/common.response.dto';

export class AppResponseSuccess {
	static COMMON<T>(data?: T) {
		return new ResponseSuccess({ data });
	}

	static JOB_PROCESSING<T>(data?: T) {
		return new ResponseSuccess({ 
			data, 
			message: 'Job is processing, will be completed in a few minutes' 
		});
	}
}

export class AppException {}
