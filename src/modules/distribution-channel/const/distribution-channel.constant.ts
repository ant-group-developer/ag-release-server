// const/distribution-channel.constant.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { DistributionChannel } from '../entities/distribution-channel.entity';

export class DistributionChannelSuccess {
	static CREATE(data: DistributionChannel) {
		return new ResponseSuccess({
			message: 'Create distribution channel success',
			messageCode: 'distributionChannel.message.success.create',
			data,
		});
	}

	static UPDATE(data: DistributionChannel) {
		return new ResponseSuccess({
			message: 'Update distribution channel success',
			messageCode: 'distributionChannel.message.success.update',
			data,
		});
	}

	static DELETE() {
		return new ResponseSuccess({
			message: 'Delete distribution channel success',
			messageCode: 'distributionChannel.message.success.delete',
		});
	}
}

export class DistributionChannelException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Distribution channel not found',
			messageCode: 'distributionChannel.message.error.notFound',
		});
	}

	static DUPLICATED() {
		return new ResponseError({
			message: 'Distribution channel already existed',
			messageCode: 'distributionChannel.message.error.duplicated',
		});
	}

	static ID_REQUIRED_FOR_UPDATE() {
		return new ResponseError({
			message: 'Distribution channel id is required for update',
			messageCode: 'distributionChannel.error.idRequiredForUpdate',
		});
	}
}
