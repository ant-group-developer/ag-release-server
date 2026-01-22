// src/modules/distribution/system-settings/system-settings.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from './entities/system-setting.entity';
import { SystemSettingsQueryService } from './services/system-settings.query.service';
import { SystemSettingsService } from './services/system-settings.service';
import { SystemSettingsController } from './system-settings.controller';

@Module({
	imports: [TypeOrmModule.forFeature([SystemSetting])],
	controllers: [SystemSettingsController],
	providers: [SystemSettingsService, SystemSettingsQueryService],
	exports: [SystemSettingsService, SystemSettingsQueryService],
})
export class SystemSettingsModule {}
