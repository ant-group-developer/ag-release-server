import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ISRC_CLIENT_NAME, ISRC_PACKAGE_NAME } from './const/isrc.constants';
import { IsrcController } from './isrc.controller';
import { IsrcService } from './isrc.service';

@Module({
	imports: [
		ClientsModule.register([
			{
				name: ISRC_CLIENT_NAME,
				transport: Transport.GRPC,
				options: {
					url: process.env.ISRC_GRPC_URL || '192.168.1.8:50051',
					package: ISRC_PACKAGE_NAME,
					protoPath: join(process.cwd(), 'proto/isrc.proto'),
				},
			},
		]),
	],
	providers: [IsrcService],
	exports: [IsrcService],
	controllers: [IsrcController],
})
export class IsrcModule {}
