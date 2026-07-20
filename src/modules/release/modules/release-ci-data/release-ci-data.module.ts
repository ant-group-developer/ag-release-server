import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CiModule } from 'src/modules/partners-api/ci/ci.module';
import { Track } from 'src/modules/track/entities/track.entity';
import { Release } from '../../entities/release.entity';
import { ReleaseModule } from '../../release.module';
import { ReleaseCiDataController } from './controllers/release-ci-data.controller';
import { ReleaseCiData } from './entities/release-ci-data.entity';
import { ReleaseCiDataService } from './services/release-ci-data.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseCiData, Release, Track]),
		CiModule,
		forwardRef(() => ReleaseModule),
	],
	controllers: [ReleaseCiDataController],
	providers: [ReleaseCiDataService],
	exports: [ReleaseCiDataService],
})
export class ReleaseCiDataModule {}
