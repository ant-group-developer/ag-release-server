import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { User } from '../user/entities/user.entity';
import { NotificationController } from './notification.controller';
import { EmailService } from './services/notification.email-service';
import { NotificationResendService } from './services/notification.resend-service';
import { NotificationService } from './services/notification.service';
import { TelegramService } from './services/notification.telegram-service';
import { NotificationUserService } from './services/notification.user-service';

@Module({
	imports: [TypeOrmModule.forFeature([User]), AppConfigModule],
	controllers: [NotificationController],
	providers: [
		NotificationService,
		EmailService,
		TelegramService,
		NotificationUserService,
		NotificationResendService,
	],
	exports: [NotificationService, NotificationResendService],
})
export class NotificationModule {}
