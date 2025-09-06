import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackRevenue } from './track-revenue.entity';

@Module({
	imports: [TypeOrmModule.forFeature([TrackRevenue])],
})
export class TrackRevenueModule {}
