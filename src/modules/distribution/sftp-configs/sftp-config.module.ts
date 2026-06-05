// src/modules/sftp-configs/sftp-config.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SftpConnectModule } from '../sftp-connect/sftp-connect.module';
import { SftpConfig } from './entities/sftp-config.entity';
import { SftpConfigQueryService } from './services/sftp-config.query.service';
import { SftpConfigsService } from './services/sftp-config.service';
import { SftpConfigsController } from './sftp-config.controller';

@Module({
	imports: [TypeOrmModule.forFeature([SftpConfig]), SftpConnectModule],
	controllers: [SftpConfigsController],
	providers: [SftpConfigsService, SftpConfigQueryService],
	exports: [SftpConfigsService, SftpConfigQueryService],
})
export class SftpConfigsModule {}
