import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClickHouseModule } from 'src/modules/clickhouse/clickhouse.module';
import { ImportJobsModule } from 'src/modules/etl/import-jobs.module';
import { ReleaseModule } from 'src/modules/release/release.module';
import { AssetImportController } from './controllers/asset-import.controller';
import { AssetImportBatch } from './entities/asset-import-batch.entity';
import { AssetImportItem } from './entities/asset-import-item.entity';
import { AssetImportApplyService } from './services/asset-import-apply.service';
import { AssetImportParserService } from './services/asset-import-parser.service';
import { AssetImportScanService } from './services/asset-import-scan.service';
import { AssetImportQueryService } from './services/asset-import.query.service';
import { AssetImportService } from './services/asset-import.service';

@Module({
	imports: [
		MulterModule.register({
			limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
		}),
		TypeOrmModule.forFeature([AssetImportBatch, AssetImportItem]),
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
		AssetImportQueryService,
	],
	exports: [AssetImportService],
})
export class AssetImportModule {}
