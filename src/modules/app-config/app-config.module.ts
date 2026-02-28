import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigController2 } from './app-config-v2.controller';
import { AppConfigService2 } from './app-config-v2.service';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';

@Global()
@Module({
	imports: [TypeOrmModule.forFeature([AppConfig])],
	controllers: [AppConfigController2, AppConfigController],
	providers: [AppConfigService, AppConfigService2],
	exports: [AppConfigService, AppConfigService2],
})
export class AppConfigModule {}
