import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { UPC_CLIENT_NAME, UPC_PACKAGE_NAME } from './upc.const';
import { UpcController } from './upc.controller';
import { UpcService } from './upc.service';

@Module({
	imports: [
		ClientsModule.register([
			{
				name: UPC_CLIENT_NAME,
				transport: Transport.GRPC,
				options: {
					url: process.env.GRPC_UPC_URL,
					package: UPC_PACKAGE_NAME,
					protoPath: join(process.cwd(), 'proto/upc.proto'),
				},
			},
		]),
	],
	providers: [UpcService],
	exports: [UpcService],
	controllers: [UpcController],
})
export class UpcModule {}
