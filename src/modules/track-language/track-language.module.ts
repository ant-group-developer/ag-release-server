import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackLanguage } from './entities/track-language.entity';

@Module({
	imports: [TypeOrmModule.forFeature([TrackLanguage])],
})
export class TrackLanguageModule {}
