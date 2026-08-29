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

	static TENANT_NOT_SET() {
		return new ResponseError({
			statusCode: 400,
			message:
				'Kênh chưa được gán vào Workspace nào. Vui lòng cập nhật Workspace cho kênh trước khi gán thành viên.',
			messageCode: 'channel.tenant_not_set',
		});
	}

	static USER_NOT_IN_WORKSPACE() {
		return new ResponseError({
			statusCode: 403,
			message: 'Người dùng không thuộc Workspace sở hữu kênh này.',
			messageCode: 'channel.user_not_in_workspace',
		});
	}

	static CHANNEL_NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Kênh không tồn tại',
			messageCode: 'channel.message.error.notFound',
		});
	}

	static CHANNEL_WORKSPACE_MISMATCH() {
		return new ResponseError({
			statusCode: 403,
			message: 'Bạn không thuộc Workspace sở hữu kênh này',
			messageCode: 'channel.message.error.workspaceMismatch',
		});
	}

	static USER_NOT_ASSIGNED_TO_CHANNEL() {
		return new ResponseError({
			statusCode: 403,
			message: 'Bạn không có quyền truy cập vào kênh này',
			messageCode: 'channel.message.error.userNotAssigned',
		});
	}

	static USE_TRANSFER_ENDPOINT() {
		return new ResponseError({
			statusCode: 400,
			message:
				'Đổi workspace kênh phải dùng POST /channels/:id/transfer kèm effectiveDate và revenueEffectiveFrom.',
			messageCode: 'channel.transfer.useTransferEndpoint',
		});
	}

	static DATES_REQUIRED() {
		return new ResponseError({
			statusCode: 400,
			message: 'effectiveDate và revenueEffectiveFrom là bắt buộc',
			messageCode: 'channel.transfer.datesRequired',
		});
	}

	static ALREADY_IN_TENANT() {
		return new ResponseError({
			statusCode: 400,
			message: 'Kênh và tài sản đã thuộc workspace đích',
			messageCode: 'channel.transfer.alreadyInTenant',
		});
	}

	static DATE_NOT_AFTER_CURRENT_PERIOD(data?: unknown) {
		return new ResponseError({
			statusCode: 400,
			message:
				'Ngày chuyển phải sau period ownership đang mở của mọi video trên kênh',
			messageCode: 'channel.transfer.dateNotAfterCurrentPeriod',
			data,
		});
	}

	static SHARED_ISRC(data?: unknown) {
		return new ResponseError({
			statusCode: 400,
			message:
				'Không thể chuyển kênh vì ISRC của video còn thuộc release khác. Gỡ conflict trước khi transfer.',
			messageCode: 'channel.transfer.sharedIsrc',
			data,
		});
	}

	static TOO_LARGE(max: number) {
		return new ResponseError({
			statusCode: 400,
			message: `Kênh có quá nhiều video để chuyển đồng bộ (tối đa ${max}).`,
			messageCode: 'channel.transfer.tooLarge',
			data: { max },
		});
	}
}

export const CHANNEL_TRANSFER_MAX_RELEASES = 500;
