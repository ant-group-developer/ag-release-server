import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { Logs } from '../entites/logs.entity';
import { LogsService } from './logs.services';

@Global()
@Module({
	imports: [TypeOrmModule.forFeature([Logs]), NotificationModule],
	providers: [LogsService],
	exports: [LogsService],
})
export class LogsModule {}
