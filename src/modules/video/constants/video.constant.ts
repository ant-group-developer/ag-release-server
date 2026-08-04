import { ResponseError } from 'src/common/dtos/common.response.dto';

export class VideoException {
	static CANNOT_CHANGE_CHANNEL_AFTER_VEVO_SENT() {
		return new ResponseError({
			statusCode: 400,
			message:
				'Không được phép thay đổi Kênh sau khi metadata đã được gửi sang Vevo',
			messageCode: 'video.message.error.cannotChangeChannelAfterVevoSent',
		});
	}

	static CANNOT_CHANGE_ISRC_AFTER_VEVO_SENT() {
		return new ResponseError({
			statusCode: 400,
			message:
				'Không được phép thay đổi ISRC sau khi metadata đã được gửi sang Vevo',
			messageCode: 'video.message.error.cannotChangeIsrcAfterVevoSent',
		});
	}
}
