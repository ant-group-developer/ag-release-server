// isrc.service.ts
import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { ISRC_CLIENT_NAME, ISRC_SERVICE_NAME } from './const/isrc.constants';
import {
	CreateIsrc,
	IsrcGrpcService,
	ListIsrcRequest,
} from './interfaces/isrc.grpc.interface';
import { ListPrefixIsrcDto } from './isrc.dto';

@Injectable()
export class IsrcService implements OnModuleInit {
	private grpcService: IsrcGrpcService;

	constructor(
		@Inject(ISRC_CLIENT_NAME)
		private readonly client: ClientGrpc,
		private readonly appConfigSv: AppConfigService,
	) {}

	onModuleInit() {
		this.grpcService =
			this.client.getService<IsrcGrpcService>(ISRC_SERVICE_NAME);
	}

	private buildMetadata(): Metadata {
		const md = new Metadata();

		const x_api_key =
			this.appConfigSv.cache.config.generator.API_KEY_GRPC_ISRC_UPC;

		md.set('x-api-key', x_api_key);
		return md;
	}

	async list(payload: ListIsrcRequest) {
		return firstValueFrom(
			this.grpcService
				.listIsrc(payload, this.buildMetadata())
				.pipe(timeout(30_000)),
		);
	}

	async create(payload: CreateIsrc) {
		return { data: { code: 'QT6KL2614737' } };
		return firstValueFrom(
			this.grpcService
				.createIsrc(payload, this.buildMetadata())
				.pipe(timeout(10_000)),
		);
	}

	async listPrefix(payload: ListPrefixIsrcDto) {
		const { keyword, fieldOrder, ...rest } = payload;

		const res = await firstValueFrom(
			this.grpcService
				.listPrefixIsrc(
					{
						...rest,
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
