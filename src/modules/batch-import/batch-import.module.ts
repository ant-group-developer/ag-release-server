import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchImportController } from './controllers/batch-import.controller';
import { BatchImportLog } from './entities/batch-import-log.entity';
import { BatchImportService } from './services/batch-import.service';
import { ExcelMapperService } from './services/excel-mapper.service';

@Module({
	imports: [TypeOrmModule.forFeature([BatchImportLog])],
	controllers: [BatchImportController],
	providers: [BatchImportService, ExcelMapperService],
	exports: [BatchImportService],
})
export class BatchImportModule {}
