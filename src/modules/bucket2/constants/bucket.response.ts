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

	static MULTIPART_SESSION_NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Multipart upload session not found',
			messageCode: 'file.multipart.notFound',
		});
	}

	static MULTIPART_INVALID_STATE(status: string) {
		return new ResponseError({
			statusCode: 409,
			message: `Multipart upload cannot be changed from status: ${status}`,
			messageCode: 'file.multipart.invalidState',
		});
	}

	static MULTIPART_EXPIRED() {
		return new ResponseError({
			statusCode: 410,
			message: 'Multipart upload session has expired',
			messageCode: 'file.multipart.expired',
		});
	}

	static INVALID_MULTIPART_PARTS(message: string) {
		return new ResponseError({
			statusCode: 400,
			message,
			messageCode: 'file.multipart.invalidParts',
		});
	}

	static FILE_SIZE_MISMATCH(expected: number, actual: number) {
		return new ResponseError({
			statusCode: 422,
			message: `Uploaded file size mismatch: expected ${expected}, got ${actual}`,
			messageCode: 'file.multipart.sizeMismatch',
		});
	}

	static MULTIPART_FORBIDDEN() {
		return new ResponseError({
			statusCode: 403,
			message: 'You cannot access this multipart upload',
			messageCode: 'file.multipart.forbidden',
		});
	}
}
