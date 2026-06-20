import { ResponseError } from 'src/common/dtos/common.response.dto';
import { VevoCreateChannelResponse } from '../interfaces/vevo.interface';

export class ChannelException {
	private static getVevoChannelErrorData(data?: VevoCreateChannelResponse) {
		const extensions = data?.errors?.[0]?.extensions;

		return {
			channel_name: extensions?.channel_name,
			youtube_channel_id: extensions?.youtube_channel_id,
		};
	}

	static ALREADY_EXISTS() {
		return new ResponseError({
			statusCode: 409,
			message: 'Channel name already exists',
			messageCode: 'channel.message.error.alreadyExists',
		});
	}

	static DUPLICATE_CHANNEL_ON_VEVO(data?: VevoCreateChannelResponse) {
		return new ResponseError({
			statusCode: 400,
			message: 'Channel already exists on the Vevo production system',
			messageCode: 'channel.message.error.duplicateChannelOnVevo',
			data: this.getVevoChannelErrorData(data),
		});
	}

	static CHANNEL_CREATE_REQUEST_EXISTS_ON_VEVO(
		data?: VevoCreateChannelResponse,
	) {
		return new ResponseError({
			statusCode: 400,
			message:
				'Channel create request has already been submitted to Vevo and is waiting to be processed',
			messageCode:
				'channel.message.error.channelCreateRequestExistsOnVevo',
			data: this.getVevoChannelErrorData(data),
		});
	}

	static VEVO_CREATE_FAILED(
		message: string,
		data?: VevoCreateChannelResponse,
		statusCode = 400,
	) {
		return new ResponseError({
			statusCode,
			message,
			messageCode: 'channel.message.error.vevoCreateFailed',
			data,
		});
	}
}
