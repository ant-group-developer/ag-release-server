import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { VevoController } from './controllers/vevo.controller';
import { VevoService } from './services/vevo.service';

@Module({
	imports: [HttpModule, AppConfigModule, TypeOrmModule.forFeature([Channel])],
	controllers: [VevoController],
	providers: [VevoService],
	exports: [VevoService],
})
export class VevoModule {}
