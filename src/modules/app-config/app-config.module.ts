import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { CiToolModule } from '../partners-api/ci-tool/ci-tool.module';
import { CiModule } from '../partners-api/ci/ci.module';
import { AppConfigCoordinatorService } from './app-config-coordinator.service';
import { AppConfigSyncService } from './app-config-sync.service';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';

@Global()
@Module({
	imports: [
		TypeOrmModule.forFeature([AppConfig, ArtistRole]),
		CiToolModule,
		forwardRef(() => CiModule),
	],
	controllers: [AppConfigController],
	providers: [
		AppConfigService,
		AppConfigSyncService,
		AppConfigCoordinatorService,
	],
	exports: [AppConfigService, AppConfigCoordinatorService],
})
export class AppConfigModule {}
