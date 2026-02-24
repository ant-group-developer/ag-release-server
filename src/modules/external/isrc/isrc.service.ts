import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ISRC_CLIENT_NAME, ISRC_SERVICE_NAME } from './const/isrc.constants';
import {
	CreateIsrc,
	IsrcGrpcService,
	ListIsrcRequest,
	ListPrefixIsrcRequest,
} from './interfaces/isrc.grpc.interface';

/* ===== REQUEST TYPES ===== */

/* ===== SERVICE ===== */

@Injectable()
export class IsrcService implements OnModuleInit {
	private grpcService: IsrcGrpcService;

	constructor(
		@Inject(ISRC_CLIENT_NAME)
		private readonly client: ClientGrpc,
	) {}

	onModuleInit() {
		this.grpcService =
			this.client.getService<IsrcGrpcService>(ISRC_SERVICE_NAME);
	}

	private buildMetadata(token: string) {
		const metadata = new Metadata();
		if (token) {
			metadata.add('authorization', token);
		}
		return metadata;
	}

	async newISRC() {}

	async list(payload: ListIsrcRequest, token: string) {
		const metadata = this.buildMetadata(token);

		return firstValueFrom(
			this.grpcService.listIsrc(payload).pipe(timeout(30000)),
		);
	}

	async create(payload: CreateIsrc, token: string) {
		const metadata = this.buildMetadata(token);

		const resGRPC = await firstValueFrom(
			this.grpcService.createIsrc(payload).pipe(timeout(10000)),
		);

		return resGRPC;
	}

	async listPrefix(payload: ListPrefixIsrcRequest, token: string) {
		const metadata = this.buildMetadata(token);

		return firstValueFrom(
			this.grpcService.listPrefixIsrc(payload).pipe(timeout(10000)),
		);
	}
}
