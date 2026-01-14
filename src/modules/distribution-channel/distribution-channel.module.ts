// aggregator.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AggregatorController } from './controllers/aggregator.controller';
import { DistributionChannelController } from './controllers/distribution-channel.controller';
import { Aggregator } from './entities/aggregator.entity';
import { DistributionChannel } from './entities/distribution-channel.entity';
import { AggregatorQueryService } from './services/aggregator-query.service';
import { AggregatorService } from './services/aggregator.service';
import { DistributionChannelQueryService } from './services/distribution-channel-query.service';
import { DistributionChannelService } from './services/distribution-channel.service';

@Module({
	imports: [TypeOrmModule.forFeature([Aggregator, DistributionChannel])],
	controllers: [AggregatorController, DistributionChannelController],
	providers: [
		AggregatorService,
		AggregatorQueryService,

		DistributionChannelService,
		DistributionChannelQueryService,
	],
	exports: [AggregatorService, DistributionChannelService],
})
export class DistributionChannelModule {}
