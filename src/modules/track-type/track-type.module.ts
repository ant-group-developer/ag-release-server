import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackType } from './entities/track-type.entity';
import { TrackTypeQueryService } from './services/track-type.query.service';
import { TrackTypeService } from './services/track-type.service';
import { TrackTypeController } from './track-type.controller';

@Module({
	imports: [TypeOrmModule.forFeature([TrackType])],
	controllers: [TrackTypeController],
	providers: [TrackTypeService, TrackTypeQueryService],
})
export class TrackTypeModule {}
