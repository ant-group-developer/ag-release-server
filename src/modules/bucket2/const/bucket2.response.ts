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

export class Bucket2Exception {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'File not found',
			messageCode: 'file.message.error.notFound',
		});
	}
}
