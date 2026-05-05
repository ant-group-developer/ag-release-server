import { Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { CiExportController } from './controllers/ci-export.controller';
import { CiReleaseController } from './controllers/ci-release.controller';
import { CiService } from './services/ci.service';

@Module({
	imports: [AppConfigModule],
	controllers: [CiReleaseController, CiExportController],
	providers: [CiService],
	exports: [CiService],
})
export class CiModule {}
