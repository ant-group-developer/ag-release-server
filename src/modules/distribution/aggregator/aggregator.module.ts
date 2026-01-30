// src/modules/aggregators/aggregator.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SftpConfigsModule } from '../sftp-configs/sftp-config.module';
import { AggregatorsController } from './aggregator.controller';
import { Aggregator } from './entities/aggregator.entity';
import { AggregatorQueryService } from './services/aggregator.query.service';
import { AggregatorsService } from './services/aggregators.service';

@Module({
	imports: [TypeOrmModule.forFeature([Aggregator]), SftpConfigsModule],
	controllers: [AggregatorsController],
	providers: [AggregatorsService, AggregatorQueryService],
	exports: [AggregatorsService, AggregatorQueryService],
})
export class AggregatorsModule {}
