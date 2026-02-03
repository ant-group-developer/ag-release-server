import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { User } from '../user/entities/user.entity';
import { EmailService } from './services/notification.email-service';
import { NotificationService } from './services/notification.service';
import { TelegramService } from './services/notification.telegram-service';
import { NotificationUserService } from './services/notification.user-service';

@Module({
	imports: [TypeOrmModule.forFeature([User]), AppConfigModule],
	providers: [
		NotificationService,
		EmailService,
		TelegramService,
		NotificationUserService,
	],
	exports: [NotificationService],
})
export class NotificationModule {}
