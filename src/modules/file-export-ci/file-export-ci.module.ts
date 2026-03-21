import { Module } from '@nestjs/common';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { FileExportCiService } from './file-export-ci.service';

@Module({
	imports: [BucketModule2],
	providers: [FileExportCiService],
	exports: [FileExportCiService],
})
export class FileExportCiModule {}
