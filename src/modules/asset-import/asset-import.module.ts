import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from 'src/modules/bucket2/bucket2.module';
import { ClickHouseModule } from 'src/modules/clickhouse/clickhouse.module';
import { ImportJobsModule } from 'src/modules/etl/import-jobs.module';
import { ReleaseMergeModule } from 'src/modules/release-merge/release-merge.module';
import { ReleaseModule } from 'src/modules/release/release.module';
import { AssetOwnershipModule } from './asset-ownership.module';
import { AssetImportController } from './controllers/asset-import.controller';
import { AssetImportBatch } from './entities/asset-import-batch.entity';
import { AssetImportItem } from './entities/asset-import-item.entity';
import { AssetImportApplyService } from './services/asset-import-apply.service';
import { AssetImportParserService } from './services/asset-import-parser.service';
import { AssetImportScanService } from './services/asset-import-scan.service';
import { AssetImportTemplateService } from './services/asset-import-template.service';
import { AssetImportQueryService } from './services/asset-import.query.service';
import { AssetImportService } from './services/asset-import.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([AssetImportBatch, AssetImportItem]),
		AssetOwnershipModule,
		BucketModule2,
		ClickHouseModule,
		ImportJobsModule,
		ReleaseModule,
		ReleaseMergeModule,
	],
	controllers: [AssetImportController],
	providers: [
		AssetImportService,
		AssetImportScanService,
		AssetImportApplyService,
		AssetImportParserService,
		AssetImportTemplateService,
		AssetImportQueryService,
	],
	exports: [AssetImportService],
})
export class AssetImportModule {}
