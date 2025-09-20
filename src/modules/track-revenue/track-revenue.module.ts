import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dsp } from '../dsp/entities/dsp.entity';
import { Release } from '../release/entities/release.entity';
import { Track } from '../track/entities/track.entity';
import { TrackRevenueController } from './controllers/track-revenue.controller';
import { TrackRevenue } from './entities/track-revenue.entity';
import { TrackRevenueDataService } from './services/track-revenue.data.service';
import { TrackRevenueService } from './services/track-revenue.service';

@Module({
	imports: [TypeOrmModule.forFeature([TrackRevenue, Track, Release, Dsp])],
	controllers: [TrackRevenueController],
	providers: [TrackRevenueDataService, TrackRevenueService],
})
export class TrackRevenueModule {}
