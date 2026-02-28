import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { Metadata } from '@grpc/grpc-js';
import { timeout } from 'rxjs/operators';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { UPC_CLIENT_NAME, UPC_SERVICE_NAME } from './upc.const';
import {
	CreateUpc,
	ListPrefixUpcRequest,
	QueryUpcRequest,
	UpcGrpcService,
} from './upc.grpc.interface';

@Injectable()
export class UpcService implements OnModuleInit {
	private grpcService: UpcGrpcService;
	private x_api_key: string;

	constructor(
		@Inject(UPC_CLIENT_NAME)
		private readonly client: ClientGrpc,

		private readonly appConfigSv: AppConfigService,
	) {}

	onModuleInit() {
		this.grpcService =
			this.client.getService<UpcGrpcService>(UPC_SERVICE_NAME);

		// this.x_api_key = await this.appConfigSv.getAPI_KEY_GRPC_ISRC_UPC();
		this.x_api_key = 'ak_6230e487bdfc7ed3083c465d1fb0f4728b4';
	}

	private buildMetadata() {
		const x_api_key = this.x_api_key;

		const md = new Metadata();
		md.set('x-api-key', x_api_key);
		return md;
	}

	async list(payload: QueryUpcRequest, token: string) {
		return firstValueFrom(
			this.grpcService
				.listUpc(payload, this.buildMetadata())
				.pipe(timeout(30_000)),
		);
	}

	async create(payload: CreateUpc, token: string) {
		return firstValueFrom(
			this.grpcService
				.createUpc(payload, this.buildMetadata())
				.pipe(timeout(10_000)),
		);
	}

	async listPrefix(payload: ListPrefixUpcRequest) {
		return firstValueFrom(
			this.grpcService
				.listPrefixUpc(payload, this.buildMetadata())
				.pipe(timeout(10_000)),
		);
	}
}
