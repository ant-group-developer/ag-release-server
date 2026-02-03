import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from '../release/entities/release.entity';
import { Track } from '../track/entities/track.entity';
import { OrmService } from './orm.service';

@Module({
	imports: [TypeOrmModule.forFeature([Release, Track])],
	providers: [OrmService],
	exports: [OrmService],
})
export class OrmModule {}
