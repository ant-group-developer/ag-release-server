import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackLocalize } from './entities/track-localize.entity';

@Module({
	imports: [TypeOrmModule.forFeature([TrackLocalize])],
})
export class TrackLocalizeModule {}
