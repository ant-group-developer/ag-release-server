// src/common/dtos/response.dto.ts

import {
	DEFAULT_CODE_SUCCESS_MESSAGE,
	DEFAULT_SUCCESS_MESSAGE,
	DEFAULT_SUCCESS_STATUS_CODE,
} from '../constants/message.constants';

/**
 * Standard wrapper for single-item responses.
 */
// export class ResponseDto<T> {
// 	/** The actual response payload. */
// 	data: T;

// 	constructor(data: T) {
// 		this.data = data;
// 	}
// }

/**
 * Metadata for paginated responses.
 */
// export class PaginationMeta {
// 	/** Total number of items across all pages. */
// 	total: number;
// 	/** Current page number (1-based). */
// 	page: number;
// 	/** Items per page. */
// 	pageSize: number;
// 	/** Total number of pages. */
// 	totalPages: number;

// 	constructor({
// 		total,
// 		page,
// 		pageSize,
// 	}: {
// 		total: number;
// 		page: number;
// 		pageSize: number;
// 	}) {
// 		this.total = total;
// 		this.page = page;
// 		this.pageSize = pageSize;
// 		this.totalPages = Math.ceil(total / pageSize);
// 	}
// }

/**
 * Standard wrapper for paginated list responses.
 */
// export class PaginatedResponseDto<T> {
// 	/** The list of items for the current page. */
// 	data: T[];

// 	/** Pagination metadata. */
// 	meta: PaginationMeta;

// 	constructor(data: T[], meta: PaginationMeta) {
// 		this.data = data;
// 		this.meta = meta;
// 	}
// }

export class ResponseSuccessDto<T> {
	statusCode: number;
	message: string;
	messageCode: string;
	data?: T;

	constructor({
		statusCode = DEFAULT_SUCCESS_STATUS_CODE,
		message = DEFAULT_SUCCESS_MESSAGE,
		messageCode = DEFAULT_CODE_SUCCESS_MESSAGE,
		data,
	}: {
		statusCode?: number;
		message?: string;
		messageCode?: string;
		data?: T;
	} = {}) {
		this.statusCode = statusCode;
		this.message = message;
		this.messageCode = messageCode;
		this.data = data;
	}
}

export class MetaData {
	currentPage: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;

	constructor({
		currentPage = 1,
		pageSize = 0,
		totalItems = 0,
	}: Partial<MetaData> = {}) {
		this.currentPage = currentPage;
		this.pageSize = pageSize;
		this.totalItems = totalItems;
		this.totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0;
	}
}

export class PageDto<T> {
	items: T[];
	metaData: MetaData;

	constructor({
		items,
		metaData,
	}: {
		items: T[];
		metaData?: Partial<MetaData>;
	}) {
		this.items = items;
		this.metaData = new MetaData({
			currentPage: metaData?.currentPage ?? 1,
			pageSize: metaData?.pageSize ?? items.length,
			totalItems: metaData?.totalItems ?? items.length,
		});
	}
}
