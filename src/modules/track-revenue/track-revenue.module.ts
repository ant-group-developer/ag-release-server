import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from '../release/entities/release.entity';
import { Track } from '../track/entities/track.entity';
import { TrackRevenue } from './entities/track-revenue.entity';
import { TrackRevenueController } from './track-revenue.controller';
import { TrackRevenueService } from './track-revenue.service';

@Module({
	imports: [TypeOrmModule.forFeature([TrackRevenue, Track, Release])],
	controllers: [TrackRevenueController],
	providers: [TrackRevenueService],
})
export class TrackRevenueModule {}
