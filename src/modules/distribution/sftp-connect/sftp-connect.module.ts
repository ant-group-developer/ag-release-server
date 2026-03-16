import { Module } from '@nestjs/common';
import { SftpConnectController } from './sftp-connect.controller';
import { SftpConnectService } from './sftp-connect.service';

@Module({
	controllers: [SftpConnectController],
	providers: [SftpConnectService],
	exports: [SftpConnectService],
})
export class SftpConnectModule {}
