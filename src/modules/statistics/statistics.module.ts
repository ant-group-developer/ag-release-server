import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artist } from '../artist/entities/artist.entity';
import { Issue } from '../issue/entities/issue.entity';
import { Label } from '../label/entities/label.entity';
import { Release } from '../release/entities/release.entity';
import { TrackRevenue } from '../track-revenue/entities/track-revenue.entity';
import { Track } from '../track/entities/track.entity';
import { StatisticsService } from './services/statistics.service';
import { StatisticsController } from './statistics.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Issue,
			Release,
			Track,
			Label,
			Artist,
			TrackRevenue,
		]),
	],
	controllers: [StatisticsController],
	providers: [StatisticsService],
})
export class StatisticsModule {}
