import { Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { CiReleaseController } from './controllers/ci-release.controller';
import { CiService } from './services/ci.service';

@Module({
	imports: [AppConfigModule],
	controllers: [CiReleaseController],
	providers: [CiService],
	exports: [CiService],
})
export class CiModule {}
