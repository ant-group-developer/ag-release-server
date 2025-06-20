import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseLanguage } from './entities/release-language.entity';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseLanguage])],
})
export class ReleaseLanguageModule {}
