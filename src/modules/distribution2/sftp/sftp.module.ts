// src/modules/distribution2/sftp/sftp.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SftpController } from './sftp.controller';
import { SftpService } from './sftp.service';

@Module({
	imports: [ConfigModule], // đảm bảo bạn đã ConfigModule.forRoot({ isGlobal: true }) ở AppModule
	providers: [SftpService],
	controllers: [SftpController],
	exports: [SftpService],
})
export class SftpModule {}
