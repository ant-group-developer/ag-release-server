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

export interface CreateIsrc {
	/** Tên đơn vị đăng ký ISRC */
	registrantName: string;

	/** Nghệ sĩ chính */
	recordingArtist: string;

	/** Tên bản ghi */
	recordingTitle: string;

	/** Phiên bản (Remix, Live...) */
	versionTitle: string;

	/** Loại tài sản (SOUND_RECORDING...) */
	assetType: string;

	/** Có phải immersive audio */
	immersive: boolean;

	/** Có nội dung explicit */
	explicit: boolean;

	/** Năm sản xuất */
	yearOfProduction: number;

	/** Thời lượng (giây) */
	duration: number;

	/** Có phải bản bổ sung */
	isAdded: boolean;

	/** ID Prefix ISRC */
	prefixIsrcId: string;
}

export interface CreateIsrcRequest extends CreateIsrc {}

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
	yearOfProduction: string; // proto đang để string
	duration: number; // int32 -> number
	isAdded: boolean;
	prefixIsrcId: string;
	createdAt: string; // ISO datetime string
	updatedAt: string; // ISO datetime string
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

/* ===== gRPC CONTRACT ===== */

export interface IsrcGrpcService {
	listIsrc(data: ListIsrcRequest): Observable<any>;
	createIsrc(data: CreateIsrcRequest): Observable<CreateIsrcResponse>;
	listPrefixIsrc(data: ListPrefixIsrcRequest): Observable<any>;
}
