import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { AssetOwnershipModule } from '../asset-import/asset-ownership.module';
import { NotificationModule } from '../notification/notification.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantUser } from '../user/entities/tenant-user.entity';
import { ChannelController } from './controllers/channel.controller';
import { ChannelHistory } from './entities/channel-history.entity';
import { Channel } from './entities/channel.entity';
import { UserChannel } from './entities/user-channel.entity';
import { ChannelAccessGuard } from './guards/channel-access.guard';
import { ChannelService } from './services/channel.service';
import { VevoService } from './services/vevo.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Channel,
			ChannelHistory,
			UserChannel,
			TenantUser,
		]),
		HttpModule,
		AppConfigModule,
		NotificationModule,
		TenantModule,
		AssetOwnershipModule,
	],
	controllers: [ChannelController],
	providers: [ChannelService, VevoService, ChannelAccessGuard],
	exports: [ChannelService, VevoService, ChannelAccessGuard],
})
export class ChannelModule {}
