import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VevoModule } from '../partners-api/vevo/vevo.module';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { Channel } from './entities/channel.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Channel]), VevoModule],
	controllers: [ChannelController],
	providers: [ChannelService],
	exports: [ChannelService],
})
export class ChannelModule {}
