import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigController } from './app-config.controller';
import { AppConfig } from './app-config.entity';
import { AppConfigService } from './app-config.service';

@Module({
	imports: [TypeOrmModule.forFeature([AppConfig])],
	controllers: [AppConfigController],
	providers: [AppConfigService],
	exports: [AppConfigService],
})
export class AppConfigModule {}
