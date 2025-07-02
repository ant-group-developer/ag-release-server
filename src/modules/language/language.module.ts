import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Language } from './entities/language.entity';
import { LanguageController } from './language.controller';
import { LanguageQbService } from './services/language.qb.service';
import { LanguageService } from './services/language.service';

@Module({
	imports: [TypeOrmModule.forFeature([Language])],
	controllers: [LanguageController],
	providers: [LanguageService, LanguageQbService],
})
export class LanguageModule {}
