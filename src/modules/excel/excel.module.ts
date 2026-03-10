import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { ExcelController } from './excel.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumFormat } from '../album-format/entities/album-format.entity';
import { PriceTier } from '../price-tiers/entities/price-tier.entity';
import { Genre } from '../genre/entities/genre.entity';
import { TrackSensitive } from '../track-sensitive/entities/track-sensitive.entity';
import { ReleaseTerritory } from '../release-territory/entities/release-territory.entity';
import { ReleaseLanguage } from '../release-language/entities/release-language.entity';
import { ExcelGetDataService } from './excel.get-data';
import { Language } from '../language/entities/language.entity';
import { Action } from '../action/entities/action.entity';

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
      Action
    ]),
  ],
  controllers: [ExcelController],
  providers: [ExcelService, ExcelGetDataService],
})
export class ExcelModule { }
