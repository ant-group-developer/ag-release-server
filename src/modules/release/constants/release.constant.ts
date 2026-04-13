import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class ReleaseSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'release.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'release.message.success.update',
			data,
		});
	}

	static DELETE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Delete success',
			messageCode: 'release.message.success.delete',
			data,
		});
	}
}

export class ReleaseException {
	static NOT_FOUND(data?: any) {
		return new ResponseError({
			statusCode: 404,
			message: 'Not found',
			messageCode: 'release.message.error.notFound',
			data,
		});
	}

	static MISSING_UPC(data?: any) {
		return new ResponseError({
			statusCode: 400,
			message: 'Missing UPC',
			messageCode: 'release.message.error.missingUpc',
			data,
		});
	}

	static MISSING_PREFIX_KEY_BUCKET_METADATA_CI(data?: any) {
		return new ResponseError({
			statusCode: 400,
			message: 'Missing prefixKeyBucketMetadataCi',
			messageCode: 'release.message.error.prefixKeyBucketMetadataCi',
			data,
		});
	}

	static ALBUM_FORMAT_NOT_FOUND(data?: any) {
		return new ResponseError({
			message: 'Album format not found',
			messageCode: 'release.message.error.albumFormatNotFound',
			data,
		});
	}

	static PRIMARY_GENRE_NOT_FOUND(data?: any) {
		return new ResponseError({
			message: 'Primary genre not found',
			messageCode: 'release.message.error.primaryGenreNotFound',
			data,
		});
	}

	static SUB_GENRE_NOT_FOUND(data?: any) {
		return new ResponseError({
			message: 'Sub-genre not found',
			messageCode: 'release.message.error.subGenreNotFound',
			data,
		});
	}

	static LABEL_NOT_FOUND(data?: any) {
		return new ResponseError({
			message: 'Label not found',
			messageCode: 'release.message.error.labelNotFound',
			data,
		});
	}

	static TIMEZONE_NOT_FOUND(data?: any) {
		return new ResponseError({
			message: 'Timezone not found',
			messageCode: 'release.message.error.timezoneNotFound',
			data,
		});
	}

	static PRICE_TIER_NOT_FOUND(data?: any) {
		return new ResponseError({
			message: 'Price tier not found',
			messageCode: 'release.message.error.priceTierNotFound',
			data,
		});
	}

	static ERROR_MAX_COUNT_TRACKS(data?: any) {
		return new ResponseError({
			message: 'Error max count tracks',
			messageCode: 'track.message.error.maxCountTrack',
			data,
		});
	}

	static ERROR_MIN_COUNT_TRACKS(data?: any) {
		return new ResponseError({
			message: 'Error min count tracks',
			messageCode: 'track.message.error.minCountTrack',
			data,
		});
	}

	static DECLINE_SYSTEM_TENANT(data?: any) {
		return new ResponseError({
			statusCode: 403,
			message: 'You cannot create release in tenant system',
			messageCode: 'release.message.error.declineSystemTenant',
			data,
		});
	}

	static MISSING_DDEX_PARTY_ID_AMG(data?: any) {
		return new ResponseError({
			message: 'Missing DDEX_PARTY_ID_AMG',
			messageCode: 'release.message.error.missingDdexPartyIdAmg',
			data,
		});
	}

	static MISSING_DDEX_PARTY_NAME_AMG(data?: any) {
		return new ResponseError({
			message: 'Missing DDEX_PARTY_NAME_AMG',
			messageCode: 'release.message.error.missingDdexPartyNameAmg',
			data,
		});
	}

	static CANNOT_DELETE_NON_DRAFT(data?: any) {
		return new ResponseError({
			statusCode: 400,
			message: 'Chỉ được phép xoá bản phát hành ở trạng thái nháp',
			messageCode: 'release.message.error.cannotDeleteNonDraft',
			data,
		});
	}

	static CANNOT_SUBMIT_INVALID_STATUS(data?: any) {
		return new ResponseError({
			statusCode: 400,
			message:
				'Chỉ được phép phát hành các bản ghi ở trạng thái nháp (draft) hoặc có lỗi (issues)',
			messageCode: 'release.message.error.cannotSubmitInvalidStatus',
			data,
		});
	}
}
