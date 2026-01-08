import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { TrackContributor } from '../entities/track-contributor.entity';

export class TrackContributorResponseSuccess {
	static CREATE(data: TrackContributor) {
		return new ResponseSuccess({
			data,
			messageCode: 'trackContributor.message.success.create',
		});
	}

	static UPDATE(data: TrackContributor) {
		return new ResponseSuccess({
			data,
			messageCode: 'trackContributor.message.success.update',
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			messageCode: 'trackContributor.message.success.delete',
		});
	}

	static FIND_ONE(data: TrackContributor) {
		return new ResponseSuccess({ data });
	}

	static GET_LIST(data: PageDto<TrackContributor>) {
		return new ResponseSuccess({ data });
	}
}
