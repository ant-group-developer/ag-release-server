import { Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { CiExportController } from './controllers/ci-export.controller';
import { CiReleaseController } from './controllers/ci-release.controller';
import { CiExportService } from './services/ci-export.service';
import { CiReleaseService } from './services/ci-release.service';
import { CiService } from './services/ci.service';

@Module({
	imports: [AppConfigModule],
	controllers: [CiReleaseController, CiExportController],
	providers: [CiService, CiReleaseService, CiExportService],
	exports: [CiService, CiReleaseService, CiExportService],
})
export class CiModule {}
