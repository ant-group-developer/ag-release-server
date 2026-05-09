import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseCoverArtModule } from '../release-cover-art/release-cover-art.module';
import { BatchImportController } from './controllers/batch-import.controller';
import { BatchImportLog } from './entities/batch-import-log.entity';
import { BatchImportService } from './services/batch-import.service';
import { ExcelMapperService } from './services/excel-mapper.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([BatchImportLog]),
		ReleaseCoverArtModule,
	],
	controllers: [BatchImportController],
	providers: [BatchImportService, ExcelMapperService],
	exports: [BatchImportService],
})
export class BatchImportModule {}
