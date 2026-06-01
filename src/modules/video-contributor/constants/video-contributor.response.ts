import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

export class VideoContributorResponseSuccess {
	static CREATE(data?: any) {
		return new ResponseSuccess({
			data,
			messageCode: 'videoContributor.message.success.create',
		});
	}

	static FIND_ONE(data?: any) {
		return new ResponseSuccess({ data });
	}

	static GET_LIST(data?: any) {
		return new ResponseSuccess({ data });
	}

	static UPDATE(data?: any) {
		return new ResponseSuccess({
			data,
			messageCode: 'videoContributor.message.success.update',
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			messageCode: 'videoContributor.message.success.delete',
		});
	}
}
