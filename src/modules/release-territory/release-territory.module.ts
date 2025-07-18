import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from '../release/entities/release.entity';
import { ReleaseTerritory } from './entities/release-territoty.entity';
import { ReleaseTerritoryService } from './services/release-territory.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseTerritory, Release])],
	providers: [ReleaseTerritoryService],
	exports: [ReleaseTerritoryService],
})
export class ReleaseTerritoryModule {}
