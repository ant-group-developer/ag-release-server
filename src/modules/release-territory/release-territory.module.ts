import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseTerritory } from './entities/release-territoty.entity';
import { ReleaseTerritoryService } from './services/release-territory.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseTerritory])],
	providers: [ReleaseTerritoryService],
	exports: [ReleaseTerritoryService],
})
export class ReleaseTerritoryModule {}
