import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Language } from './entities/language.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Language])],
})
export class LanguageModule {}
