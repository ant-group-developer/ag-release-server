import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountryController } from './country.controller';
import { Country } from './entities/country.entity';
import { CountryQbService } from './services/country.qb.service';
import { CountryService } from './services/country.service';

@Module({
	imports: [TypeOrmModule.forFeature([Country])],
	controllers: [CountryController],
	providers: [CountryService, CountryQbService],
})
export class CountryModule {}
