import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from 'src/modules/bucket2/bucket2.module';
import { ClickHouseModule } from 'src/modules/clickhouse/clickhouse.module';
import { ImportJobsModule } from 'src/modules/etl/import-jobs.module';
import { ReleaseModule } from 'src/modules/release/release.module';
import { AssetImportController } from './controllers/asset-import.controller';
import { AssetImportBatch } from './entities/asset-import-batch.entity';
import { AssetImportItem } from './entities/asset-import-item.entity';
import { AssetOwnershipPeriod } from './entities/asset-ownership-period.entity';
import { AssetOwnershipTransferEvent } from './entities/asset-ownership-transfer-event.entity';
import { AssetImportApplyService } from './services/asset-import-apply.service';
import { AssetImportParserService } from './services/asset-import-parser.service';
import { AssetImportScanService } from './services/asset-import-scan.service';
import { AssetImportTemplateService } from './services/asset-import-template.service';
import { AssetImportQueryService } from './services/asset-import.query.service';
import { AssetImportService } from './services/asset-import.service';
import { AssetOwnershipService } from './services/asset-ownership.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([AssetImportBatch, AssetImportItem, AssetOwnershipPeriod, AssetOwnershipTransferEvent]),
		BucketModule2,
		ClickHouseModule,
		ImportJobsModule,
		ReleaseModule,
	],
	controllers: [AssetImportController],
	providers: [
		AssetImportService,
		AssetImportScanService,
		AssetImportApplyService,
		AssetImportParserService,
		AssetImportTemplateService,
		AssetImportQueryService,
		AssetOwnershipService,
	],
	exports: [AssetImportService],
})
export class AssetImportModule {}
