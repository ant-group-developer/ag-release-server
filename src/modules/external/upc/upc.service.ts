import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { Metadata } from '@grpc/grpc-js';
import { timeout } from 'rxjs/operators';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { UPC_CLIENT_NAME, UPC_SERVICE_NAME } from './upc.const';
import { ListPrefixUpcDto } from './upc.dto';
import {
	CreateUpc,
	QueryUpcRequest,
	UpcGrpcService,
} from './upc.grpc.interface';

@Injectable()
export class UpcService implements OnModuleInit {
	private grpcService: UpcGrpcService;

	constructor(
		@Inject(UPC_CLIENT_NAME)
		private readonly client: ClientGrpc,

		private readonly appConfigSv: AppConfigService,
	) {}

	onModuleInit() {
		this.grpcService =
			this.client.getService<UpcGrpcService>(UPC_SERVICE_NAME);
	}

	private buildMetadata() {
		const x_api_key =
			this.appConfigSv.cache.config.generator.API_KEY_GRPC_ISRC_UPC;

		const md = new Metadata();
		md.set('x-api-key', x_api_key);
		return md;
	}

	async list(payload: QueryUpcRequest) {
		return firstValueFrom(
			this.grpcService
				.listUpc(payload, this.buildMetadata())
				.pipe(timeout(30_000)),
		);
	}

	async create(payload: CreateUpc) {
		return firstValueFrom(
			this.grpcService
				.createUpc(payload, this.buildMetadata())
				.pipe(timeout(10_000)),
		);
	}

	async listPrefix(payload: ListPrefixUpcDto) {
		const { keyword, fieldOrder } = payload;

		const res = await firstValueFrom(
			this.grpcService
				.listPrefixUpc(
					{
						...payload,
						search: keyword?.[0] ?? '',
						sortBy: fieldOrder,
					},
					this.buildMetadata(),
				)
				.pipe(timeout(10_000)),
		);

		return new PageDto({
			items: res?.data ?? [],
			metadata: res?.metadata ?? {},
		});
	}
}
