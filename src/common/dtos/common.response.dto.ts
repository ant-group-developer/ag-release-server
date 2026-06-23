// src/common/dtos/response.dto.ts

import { HttpException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { omit } from 'lodash';
import {
	DEFAULT_SENSITIVE_KEYS,
	ERROR_MESSAGE_CODE_DEFAULT,
	ERROR_MESSAGE_DEFAULT,
	ERROR_STATUS_CODE_DEFAULT,
	SUCCESS_MESSAGE_CODE_DEFAULT,
	SUCCESS_MESSAGE_DEFAULT,
	SUCCESS_STATUS_CODE_DEFAULT,
} from '../constants/common.default.constants';

export class ResponseSuccess<T> {
	@ApiProperty({ example: 200 })
	statusCode: number;

	@ApiProperty({ example: 'Success' })
	message: string;

	@ApiProperty({ example: 'SUCCESS' })
	messageCode: string;

	@ApiPropertyOptional({ example: 'Some warning' })
	messageWarning?: string;

	// generic => subclass sẽ override để gắn type cụ thể
	@ApiPropertyOptional()
	data?: T;

	@ApiPropertyOptional()
	tenant?: any;

	constructor({
		statusCode = SUCCESS_STATUS_CODE_DEFAULT,
		message = SUCCESS_MESSAGE_DEFAULT,
		messageCode = SUCCESS_MESSAGE_CODE_DEFAULT,
		messageWarning,
		sensitiveKeys = [],
		isRemoveSensitiveFields = false,
		data,
		tenant,
	}: {
		statusCode?: number;
		message?: string;
		messageCode?: string;
		messageWarning?: string;
		sensitiveKeys?: string[];
		isRemoveSensitiveFields?: boolean;
		data?: T;
		tenant?: any;
	} = {}) {
		this.statusCode = statusCode;
		this.message = message;
		this.messageCode = messageCode;
		this.messageWarning = messageWarning;
		this.tenant = tenant;

		// IMPORTANT: nếu không remove sensitive thì vẫn phải gán data
		if (data !== undefined) {
			if (isRemoveSensitiveFields && data) {
				sensitiveKeys.push(...DEFAULT_SENSITIVE_KEYS);
				this.data = this.removeSensitiveFields(data, sensitiveKeys);
			} else {
				this.data = data;
			}
		}
	}

	private removeSensitiveFields<T>(data: T, sensitiveKeys: string[]): T {
		// array
		if (Array.isArray(data)) {
			return data.map((item) =>
				this.removeSensitiveFields(item, sensitiveKeys),
			) as T;
		}

		// object (trừ Date)
		if (data && typeof data === 'object' && !(data instanceof Date)) {
			const shallow = omit(data as Record<string, any>, sensitiveKeys);

			return Object.fromEntries(
				Object.entries(shallow).map(([key, value]) => [
					key,
					this.removeSensitiveFields(value, sensitiveKeys),
				]),
			) as T;
		}

		// primitive, null, undefined, Date
		return data;
	}
}

export class Metadata {
	page: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;

	constructor({
		page = 1,
		pageSize = 0,
		totalItems = 0,
	}: Partial<Metadata> = {}) {
		this.page = page;
		this.pageSize = pageSize;
		this.totalItems = totalItems;
		this.totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0;
	}
}

export class PageDto<T> {
	metadata: Metadata;
	items: T[];

	constructor({
		items,
		metadata,
	}: {
		items: T[];
		metadata?: Partial<Metadata>;
	}) {
		this.metadata = new Metadata({
			page: metadata?.page ?? 1,
			pageSize: metadata?.pageSize ?? items.length,
			totalItems: metadata?.totalItems ?? items.length,
		});

		this.items = items;
	}
}

export class ResponseError<T = any> extends HttpException {
	statusCode: number;
	message: string;
	messageCode: string;
	messageWarning: string;
	data?: T;

	constructor({
		statusCode = ERROR_STATUS_CODE_DEFAULT,
		message = ERROR_MESSAGE_DEFAULT,
		messageCode = ERROR_MESSAGE_CODE_DEFAULT,
		messageWarning,
		data,
	}: {
		statusCode?: number;
		message?: string;
		messageCode?: string;
		messageWarning?: string;
		data?: T;
	}) {
		const response = {
			statusCode,
			message,
			messageCode,
			messageWarning,
			data,
		};

		super(response, statusCode);

		// this.statusCode = statusCode;
		// this.message = message;
		// this.data = data;
	}
}

export class FieldErrorDetails {
	messageCode: string;
	message: string;
	page: string;
	field: string;
	trackId?: string;

	constructor({
		messageCode = 'validation.input',
		message = 'Please enter information!',
		page = 'unknown',
		field = 'unknown',
		trackId,
	}: {
		messageCode?: string;
		message?: string;
		page?: string;
		field?: string;
		trackId?: string;
	}) {
		this.messageCode = messageCode;
		this.message = message;
		this.page = page;
		this.field = field;
		this.trackId = trackId;
	}
}
