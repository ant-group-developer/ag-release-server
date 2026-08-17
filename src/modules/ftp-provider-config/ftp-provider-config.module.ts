// src/modules/ftp-provider-config/ftp-provider-config.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FtpProviderConfig } from './entities/ftp-provider-config.entity';
import { FtpProviderConfigController } from './ftp-provider-config.controller';
import { FtpProviderConfigQueryService } from './services/ftp-provider-config.query.service';
import { FtpProviderConfigService } from './services/ftp-provider-config.service';

@Module({
	imports: [TypeOrmModule.forFeature([FtpProviderConfig])],
	controllers: [FtpProviderConfigController],
	providers: [FtpProviderConfigService, FtpProviderConfigQueryService],
	exports: [FtpProviderConfigService, FtpProviderConfigQueryService],
})
export class FtpProviderConfigModule {}
