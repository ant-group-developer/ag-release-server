import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { ISRC_CLIENT_NAME, ISRC_SERVICE_NAME } from './const/isrc.constants';

/* ===== REQUEST TYPES ===== */

export interface ListIsrcRequest {
	page?: number;
	pageSize?: number;
	search?: string;
	code?: string;
	recordingArtist?: string;
	registrantName?: string;
	yearOfProduction?: string;
	assetType?: string;
	prefixIsrcId?: string;
	immersive?: boolean;
	explicit?: boolean;
	isAdded?: boolean;
	sortBy?: string;
	orderBy?: string;
}

export interface CreateIsrcRequest {
	registrantName: string;
	recordingArtist: string;
	recordingTitle: string;
	versionTitle: string;
	assetType: string;
	immersive: boolean;
	explicit: boolean;
	yearOfProduction: number;
	duration: number;
	isAdded: boolean;
	prefixIsrcId: string;
}

export interface ListPrefixIsrcRequest {
	page?: number;
	pageSize?: number;
	search?: string;
	sortBy?: string;
	orderBy?: string;
}

/* ===== gRPC CONTRACT ===== */

export interface IsrcGrpcService {
	listIsrc(data: ListIsrcRequest): Observable<any>;
	createIsrc(data: CreateIsrcRequest): Observable<any>;
	listPrefixIsrc(data: ListPrefixIsrcRequest): Observable<any>;
}

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

	async list(payload: ListIsrcRequest, token: string) {
		const metadata = this.buildMetadata(token);

		return firstValueFrom(
			(this.grpcService as any)
				.listIsrc(payload, metadata)
				.pipe(timeout(30000)),
		);
	}

	async create(payload: CreateIsrcRequest, token: string) {
		const metadata = this.buildMetadata(token);

		return firstValueFrom(
			(this.grpcService as any)
				.createIsrc(payload, metadata)
				.pipe(timeout(10000)),
		);
	}

	async listPrefix(payload: ListPrefixIsrcRequest, token: string) {
		const metadata = this.buildMetadata(token);

		return firstValueFrom(
			(this.grpcService as any)
				.listPrefixIsrc(payload, metadata)
				.pipe(timeout(10000)),
		);
	}
}
