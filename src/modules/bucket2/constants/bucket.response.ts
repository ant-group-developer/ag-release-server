import { AppResponseSuccess } from 'src/app.const';
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class Bucket2ResponseSuccess extends AppResponseSuccess {
	static COMMON<Aggregator>(data?: Aggregator) {
		return new ResponseSuccess({
			data,
			isRemoveSensitiveFields: true,
			sensitiveKeys: ['password', 'privateKey'],
		});
	}
}

export class BucketException {
	static FILE_NOT_FOUND_IN_DB() {
		return new ResponseError({
			statusCode: 404,
			message: 'File not found in database',
			messageCode: 'file.error.notFoundDb',
		});
	}

	static FILE_NOT_FOUND_IN_STORAGE() {
		return new ResponseError({
			statusCode: 404,
			message: `File not found in bucket`,
			messageCode: 'file.error.notFoundStorate',
		});
	}
}
