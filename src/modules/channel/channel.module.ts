import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { NotificationModule } from '../notification/notification.module';
import { TenantModule } from '../tenant/tenant.module';
import { ChannelController } from './controllers/channel.controller';
import { ChannelHistory } from './entities/channel-history.entity';
import { Channel } from './entities/channel.entity';
import { ChannelService } from './services/channel.service';
import { VevoService } from './services/vevo.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Channel, ChannelHistory]),
		HttpModule,
		AppConfigModule,
		NotificationModule,
		TenantModule,
	],
	controllers: [ChannelController],
	providers: [ChannelService, VevoService],
	exports: [ChannelService, VevoService],
})
export class ChannelModule {}
