import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Action } from '../action/entities/action.entity';
import { AlbumFormat } from '../album-format/entities/album-format.entity';
import { Genre } from '../genre/entities/genre.entity';
import { Language } from '../language/entities/language.entity';
import { PriceTier } from '../price-tiers/entities/price-tier.entity';
import { ReleaseLanguage } from '../release-language/entities/release-language.entity';
import { ReleaseTerritory } from '../release-territory/entities/release-territory.entity';
import { TrackSensitive } from '../track-sensitive/entities/track-sensitive.entity';
import { ExcelController } from './excel.controller';
import { ExcelGetDataService } from './excel.get-data';
import { ExcelService } from './excel.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			AlbumFormat,
			PriceTier,
			Genre,
			TrackSensitive,
			ReleaseTerritory,
			ReleaseLanguage,
			Language,
			Action,
		]),
	],
	controllers: [ExcelController],
	providers: [ExcelService, ExcelGetDataService],
})
export class ExcelModule {}
