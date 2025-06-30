import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountryController } from './country.controller';
import { Country } from './entities/country.entity';
import { CountryService } from './services/country.service';

@Module({
	imports: [TypeOrmModule.forFeature([Country])],
	controllers: [CountryController],
	providers: [CountryService],
})
export class CountryModule {}
