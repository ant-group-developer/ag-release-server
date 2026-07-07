import { Module, forwardRef } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { CiExportController } from './controllers/ci-export.controller';
import { CiImportController } from './controllers/ci-import.controller';
import { CiReleaseController } from './controllers/ci-release.controller';
import { CiExportService } from './services/ci-export.service';
import { CiImportService } from './services/ci-import.service';
import { CiReleaseService } from './services/ci-release.service';
import { CiService } from './services/ci.service';

@Module({
	imports: [forwardRef(() => AppConfigModule)],
	controllers: [CiReleaseController, CiExportController, CiImportController],
	providers: [CiService, CiReleaseService, CiExportService, CiImportService],
	exports: [CiService, CiReleaseService, CiExportService, CiImportService],
})
export class CiModule {}
