import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { Logs } from './entites/logs.entity';
import { LogsController } from './logs.controller';
import { LogsService } from './services/logs.services';

@Global()
@Module({
	imports: [TypeOrmModule.forFeature([Logs]), NotificationModule],
	controllers: [LogsController],
	providers: [LogsService],
	exports: [LogsService],
})
export class LogsModule {}
