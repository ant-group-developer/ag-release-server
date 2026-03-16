// isrc.grpc.interface.ts
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';

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

export interface IsrcItem {
	id: string;
	code: string;
	registrantName: string;
	recordingArtist: string;
	recordingTitle: string;
	versionTitle: string;
	assetType: string;
	immersive: boolean;
	explicit: boolean;
	yearOfProduction: string;
	duration: number;
	isAdded: boolean;
	prefixIsrcId: string;
	createdAt: string;
	updatedAt: string;
}

export interface PaginationMeta {
	totalItems: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface ListIsrcResponse {
	data: IsrcItem[];
	metadata: PaginationMeta;
	message: string;
}

export interface CreateIsrc {
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

export interface CreateIsrcResponse {
	data: IsrcItem;
	message: string;
}

export interface ListPrefixIsrcRequest {
	page?: number;
	pageSize?: number;
	search?: string;
	sortBy?: string;
	orderBy?: string;
}

export interface PrefixIsrcItem {
	id: string;
	code: string;
	maxQuantity: number;
	createdAt: string;
	updatedAt: string;
	type: string;
}

export interface ListPrefixIsrcResponse {
	data: PrefixIsrcItem[];
	metadata: PaginationMeta;
	message: string;
}

export interface IsrcGrpcService {
	listIsrc(
		data: ListIsrcRequest,
		metadata?: Metadata,
	): Observable<ListIsrcResponse>;
	createIsrc(
		data: CreateIsrc,
		metadata?: Metadata,
	): Observable<CreateIsrcResponse>;
	listPrefixIsrc(
		data: ListPrefixIsrcRequest,
		metadata?: Metadata,
	): Observable<ListPrefixIsrcResponse>;
}
