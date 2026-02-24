import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
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

	constructor(
		@Inject(UPC_CLIENT_NAME)
		private readonly client: ClientGrpc,
	) {}

	onModuleInit() {
		this.grpcService =
			this.client.getService<UpcGrpcService>(UPC_SERVICE_NAME);
	}

	private buildMetadata(token: string) {
		const metadata = new Metadata();
		if (token) metadata.add('authorization', token);
		return metadata;
	}

	async list(payload: QueryUpcRequest, token: string) {
		const metadata = this.buildMetadata(token);
		// NOTE: typings của Nest thường không nhận metadata param,
		// nên giữ pattern giống ISRC của bạn.
		return firstValueFrom(
			this.grpcService.listUpc(payload).pipe(timeout(30_000)),
		);
	}

	async create(payload: CreateUpc, token: string) {
		const metadata = this.buildMetadata(token);
		return firstValueFrom(
			this.grpcService.createUpc(payload).pipe(timeout(10_000)),
		);
	}

	async listPrefix(payload: ListPrefixUpcRequest, token: string) {
		const metadata = this.buildMetadata(token);
		return firstValueFrom(
			this.grpcService.listPrefixUpc(payload).pipe(timeout(10_000)),
		);
	}
}
