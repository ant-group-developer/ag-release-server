import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from '../release/entities/release.entity';
import { ReleaseCoverArt } from './entities/release-cover-art.entity';
import { ReleaseCoverArtController } from './release-cover-art.controller';
import { ReleaseCoverArtService } from './services/release-cover-art.service';
import { ReleaseCoverArtValidateService } from './services/release-cover-art.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseCoverArt, Release])],
	controllers: [ReleaseCoverArtController],
	providers: [ReleaseCoverArtService, ReleaseCoverArtValidateService],
})
export class ReleaseCoverArtModule {}
