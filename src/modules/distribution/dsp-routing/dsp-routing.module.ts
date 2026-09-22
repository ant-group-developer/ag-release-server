// src/modules/dsp-routing-configs/dsp-routing-config.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { AggregatorsModule } from '../aggregator/aggregator.module';
import { SftpConfigsModule } from '../sftp-configs/sftp-config.module';
import { SftpConnectModule } from '../sftp-connect/sftp-connect.module';
import { DspRoutingConfigsController } from './dsp-routing-config.controller';
import { DspRoutingConfig } from './entities/dsp-routing-config.entity';
import { DspRoutingConsumer } from './services/dsp-routing-config.consumer';
import { DspRoutingConfigQueryService } from './services/dsp-routing-config.query.service';
import { DspRoutingConfigsService } from './services/dsp-routing-config.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			DspRoutingConfig,
			//  Aggregator, SftpConfig
		]),
		SftpConfigsModule,
		AggregatorsModule,
		AppConfigModule,
		SftpConnectModule,
	],
	controllers: [DspRoutingConfigsController],
	providers: [
		DspRoutingConsumer,
		DspRoutingConfigsService,
		DspRoutingConfigQueryService,
	],
	exports: [DspRoutingConfigsService, DspRoutingConfigQueryService],
})
export class DspRoutingConfigsModule {}
