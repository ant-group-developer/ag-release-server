import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { VevoModule } from '../partners-api/vevo/vevo.module';
import { TenantModule } from '../tenant/tenant.module';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { ChannelHistory } from './entities/channel-history.entity';
import { Channel } from './entities/channel.entity';

@Module({
	imports: [
		TypeOrmModule.forFeature([Channel, ChannelHistory]),
		BucketModule2,
		VevoModule,
		TenantModule,
	],
	controllers: [ChannelController],
	providers: [ChannelService],
	exports: [ChannelService],
})
export class ChannelModule {}
