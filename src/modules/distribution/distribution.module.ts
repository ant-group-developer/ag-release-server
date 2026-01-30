// src/modules/sftp-configs/sftp-config.module.ts
import { Module } from '@nestjs/common';
import { AggregatorsModule } from './aggregator/aggregator.module';
import { DspRoutingConfigsModule } from './dsp-routing/dsp-routing.module';
import { SftpConfigsModule } from './sftp-configs/sftp-config.module';

@Module({
	controllers: [],
	imports: [SftpConfigsModule, DspRoutingConfigsModule, AggregatorsModule],
})
export class DistributionModule {}
