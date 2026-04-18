import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseError, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { NotificationResendService } from './services/notification.resend-service';

@ApiTags('Notification')
@Controller('notifications')
export class NotificationController {
	constructor(
		private readonly notificationResendService: NotificationResendService,
	) {}

	@Post('test-resend')
	async testResend(@Body('email') email: string) {
		if (!email) {
			throw new ResponseError({ message: 'Vui lòng truyền email cần gửi vào body { "email": "..." }' });
		}
		
		const success = await this.notificationResendService.sendEmail({
			to: email,
			subject: 'Test Email từ hệ thống (Resend)',
			html: '<h1>Xin chào,</h1><p>Đây là email test để kiểm tra tích hợp API Resend lấy cấu hình từ hệ thống.</p>'
		});

		if (!success) {
            throw new ResponseError({ message: 'Gửi thất bại. Vui lòng kiểm tra API Key hoặc Config và Log ứng dụng.' });
        }

		return new ResponseSuccess({ message: 'Đã gửi email test thành công thông qua Resend!' });
	}
}
