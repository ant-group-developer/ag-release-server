import { Module } from '@nestjs/common';
import { EmailService } from './services/notification.email-service';
import { NotificationService } from './services/notification.service';
import { TelegramService } from './services/notification.telegram-service';

@Module({
	imports: [],
	providers: [NotificationService, EmailService, TelegramService],
	exports: [NotificationService],
})
export class NotificationModule {}
