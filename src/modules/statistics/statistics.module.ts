import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from '../release/entities/release.entity';
import { Track } from '../track/entities/track.entity';

@Module({ imports: [TypeOrmModule.forFeature([Release, Track])] })
export class StatisticsModule {}
