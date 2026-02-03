import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

export class ReleaseContributorSuccess {
	static CREATE(data?: any) {
		return new ResponseSuccess({
			data,
			messageCode: 'releaseContributor.message.success.create',
		});
	}

	static UPDATE(data?: any) {
		return new ResponseSuccess({
			data,
			messageCode: 'releaseContributor.message.success.update',
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			messageCode: 'releaseContributor.message.success.delete',
		});
	}

	static COMMON(data?: any) {
		return new ResponseSuccess({
			data,
		});
	}
}
