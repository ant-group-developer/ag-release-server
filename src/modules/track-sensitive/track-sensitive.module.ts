import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackSensitive } from './entities/track-sensitive.entity';
import { TrackSensitiveQueryService } from './services/track-sensitive.query.service';
import { TrackSensitiveService } from './services/track-sensitive.service';
import { TrackSensitiveController } from './track-sensitive.controller';

@Module({
	imports: [TypeOrmModule.forFeature([TrackSensitive])],
	controllers: [TrackSensitiveController],
	providers: [TrackSensitiveService, TrackSensitiveQueryService],
})
export class TrackSensitiveModule {}
