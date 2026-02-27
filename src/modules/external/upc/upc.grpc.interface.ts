import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';

/* ===== REQUEST TYPES ===== */

export interface QueryUpcRequest {
	page?: number;
	pageSize?: number;
	search?: string;
	prefixUpcId?: string;
	status?: string;
	industry?: string;

	isVariable?: boolean;
	isPurchasable?: boolean;
	isAdded?: boolean;

	sortBy?: string;
	orderBy?: string;
}

export interface CreateUpc {
	/** ID Prefix UPC */
	prefixUpcId: string;

	/** Cấp độ đóng gói (Each, Inner Pack, Case...) */
	packagingLevel: string;

	/** Mô tả sản phẩm */
	description: string;

	/** Ngôn ngữ của mô tả (vd: en, vi) */
	desc1Language: string;

	/** Tên thương hiệu */
	brandName: string;

	/** Ngôn ngữ của thương hiệu */
	brand1Language: string;

	/** Trạng thái UPC (ACTIVE, INACTIVE...) */
	status: string;

	/** Ngành hàng (MUSIC, RETAIL...) */
	industry: string;

	/** Có phải mã biến đổi (variable measure) */
	isVariable: boolean;

	/** Có thể bán thương mại */
	isPurchasable: boolean;

	/** Có phải bản bổ sung */
	isAdded: boolean;

	/** Danh sách thị trường mục tiêu (VN, US, JP...) */
	targetMarkets: string[];
}

export interface CreateUpcRequest extends CreateUpc {}

/* ===== RESPONSE TYPES ===== */

export interface UpcItem {
	id: string;
	prefixUpcId: string;
	gs1CompanyPrefix: string;
	gtin: string;
	packagingLevel: string;
	description: string;
	desc1Language: string;
	brandName: string;
	brand1Language: string;
	status: string;
	industry: string;
	isVariable: boolean;
	isPurchasable: boolean;
	isAdded: boolean;
	targetMarkets: string[];
	createdAt: string;
	updatedAt: string;
}

export interface Pagination {
	totalItems: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface QueryUpcResponse {
	data: UpcItem[];
	metadata: Pagination;
	message: string;
}

export interface CreateUpcResponse {
	data: UpcItem;
	message: string;
}

export interface ListPrefixUpcRequest {
	page?: number;
	pageSize?: number;
	search?: string;
	sortBy?: string;
	orderBy?: string;
}

export interface PrefixUpcItem {
	id: string;
	code: string;
	brandName: string;
	maxQuantity: number;
	createdAt: string;
	updatedAt: string;
	type: string;
}

export interface ListPrefixUpcResponse {
	data: PrefixUpcItem[];
	metadata: Pagination;
	message: string;
}

/* ===== gRPC CONTRACT ===== */

export interface UpcGrpcService {
	listUpc(
		data: QueryUpcRequest,
		metadata?: Metadata,
	): Observable<QueryUpcResponse>;
	createUpc(
		data: CreateUpcRequest,
		metadata?: Metadata,
	): Observable<CreateUpcResponse>;
	listPrefixUpc(
		data: ListPrefixUpcRequest,
		metadata?: Metadata,
	): Observable<ListPrefixUpcResponse>;
}
