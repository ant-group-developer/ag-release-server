import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '../app-config/app-config.module';
import { TenantModule } from '../tenant/tenant.module';
import { ChannelController } from './controllers/channel.controller';
import { VevoController } from './controllers/vevo.controller';
import { ChannelHistory } from './entities/channel-history.entity';
import { Channel } from './entities/channel.entity';
import { VevoCallbackApiKeyGuard } from './guards/vevo-callback-api-key.guard';
import { ChannelService } from './services/channel.service';
import { VevoService } from './services/vevo.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Channel, ChannelHistory]),
		HttpModule,
		AppConfigModule,
		TenantModule,
	],
	controllers: [ChannelController, VevoController],
	providers: [ChannelService, VevoService, VevoCallbackApiKeyGuard],
	exports: [ChannelService],
})
export class ChannelModule {}
