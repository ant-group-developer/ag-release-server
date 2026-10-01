import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseMergeController } from './controllers/release-merge.controller';
import { ReleaseMergeAlias } from './entities/release-merge-alias.entity';
import { ReleaseMergeItem } from './entities/release-merge-item.entity';
import { ReleaseMergeRun } from './entities/release-merge-run.entity';
import { ReleaseStatIdentity } from './entities/release-stat-identity.entity';
import { TrackMergeAlias } from './entities/track-merge-alias.entity';
import { ReleaseMergeScanService } from './services/release-merge-scan.service';
import { ReleaseMergeService } from './services/release-merge.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			ReleaseMergeRun,
			ReleaseMergeItem,
			ReleaseMergeAlias,
			TrackMergeAlias,
			ReleaseStatIdentity,
		]),
	],
	controllers: [ReleaseMergeController],
	providers: [ReleaseMergeService, ReleaseMergeScanService],
	exports: [ReleaseMergeService, ReleaseMergeScanService],
})
export class ReleaseMergeModule {}
