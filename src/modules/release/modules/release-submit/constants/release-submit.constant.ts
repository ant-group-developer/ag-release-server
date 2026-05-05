import { ResponseError } from 'src/common/dtos/common.response.dto';

export class ReleaseSubmitException {
	static MISSING_EXPORT_ID_FROM_CI(data?: any) {
		return new ResponseError({
			statusCode: 400,
			message: 'Missing exportIdFromCi from EXPORT_CI step output',
			messageCode: 'releaseSubmit.error.missingExportIdFromCi',
			data,
		});
	}
}
