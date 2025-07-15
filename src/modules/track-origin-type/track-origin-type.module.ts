import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackOriginType } from './entities/track-origin-type.entity';
import { TrackOriginTypeQueryService } from './services/track-origin-type.query.service';
import { TrackOriginTypeService } from './services/track-origin-type.service';
import { TrackOriginTypeController } from './track-origin-type.controller';

@Module({
	imports: [TypeOrmModule.forFeature([TrackOriginType])],
	controllers: [TrackOriginTypeController],
	providers: [TrackOriginTypeService, TrackOriginTypeQueryService],
})
export class TrackOriginTypeModule {}
