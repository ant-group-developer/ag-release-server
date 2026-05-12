// request-tracking/services/request-tracking.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { orderAndPaging2 } from '../orm/utils/orm.utils';
import { QueryGetListRequestLogDto } from './dto/request-log.dto';
import { RequestLog } from './entities/request-tracking.entity';

type CreateRequestLogDto = {
	method: string;
	url: string;
	route?: string;

	ip?: string;
	userAgent?: string;

	headers?: Record<string, any>;
	body?: Record<string, any>;
	query?: Record<string, any>;
	params?: Record<string, any>;

	userId?: string;
	userRole?: string;

	statusCode?: number;
	responseBody?: Record<string, any>;

	errorMessage?: string;
	errorName?: string;
	errorStack?: string;
	errorCause?: any;

	duration?: number;
};

@Injectable()
export class RequestTrackingService {
	constructor(
		@InjectRepository(RequestLog)
		private readonly repo: Repository<RequestLog>,
	) {}

	/**
	 * Dùng cho interceptor.
	 * Không throw error để tránh làm ảnh hưởng request chính.
	 */
	async createSafe(dto: CreateRequestLogDto): Promise<void> {
		try {
			await this.create(dto);
		} catch {
			// intentionally ignore
		}
	}

	async create(dto: CreateRequestLogDto): Promise<RequestLog> {
		const log = this.repo.create({
			method: dto.method,
			url: dto.url,
			route: dto.route || dto.url,

			ip: dto.ip,
			userAgent: dto.userAgent,

			headers: this.sanitizeObject(dto.headers),
			body: this.sanitizeObject(dto.body),
			query: dto.query,
			params: dto.params,

			userId: dto.userId,
			userRole: dto.userRole,

			statusCode: dto.statusCode,
			responseBody: this.truncateObject(
				this.sanitizeObject(dto.responseBody),
			),

			errorMessage: dto.errorMessage,
			errorName: dto.errorName,
			errorStack: dto.errorStack,
			errorCause: this.truncateObject(dto.errorCause),

			duration: dto.duration,
		});

		return this.repo.save(log);
	}

	async getList(query: QueryGetListRequestLogDto) {
		const {
			page,
			pageSize,
			method,
			statusCode,
			statusCodes,
			userId,
			userRole,
			route,
			url,
			ip,
			fromDate,
			toDate,
			minDuration,
			maxDuration,
			hasError,
		} = query;

		const qb = this.repo.createQueryBuilder('requestLog');

		if (method?.length) {
			qb.andWhere('requestLog.method IN (:...method)', { method });
		}

		if (statusCode) {
			qb.andWhere('requestLog.statusCode = :statusCode', {
				statusCode,
			});
		}

		if (statusCodes?.length) {
			qb.andWhere('requestLog.statusCode IN (:...statusCodes)', {
				statusCodes,
			});
		}

		if (userId) {
			qb.andWhere('requestLog.userId = :userId', { userId });
		}

		if (userRole) {
			qb.andWhere('requestLog.userRole = :userRole', { userRole });
		}

		if (route) {
			qb.andWhere('requestLog.route ILIKE :route', {
				route: `%${route}%`,
			});
		}

		if (url) {
			qb.andWhere('requestLog.url ILIKE :url', {
				url: `%${url}%`,
			});
		}

		if (ip) {
			qb.andWhere('requestLog.ip = :ip', { ip });
		}

		if (fromDate) {
			qb.andWhere('requestLog.createdAt >= :fromDate', {
				fromDate,
			});
		}

		if (toDate) {
			qb.andWhere('requestLog.createdAt <= :toDate', {
				toDate,
			});
		}

		if (minDuration !== undefined) {
			qb.andWhere('requestLog.duration >= :minDuration', {
				minDuration,
			});
		}

		if (maxDuration !== undefined) {
			qb.andWhere('requestLog.duration <= :maxDuration', {
				maxDuration,
			});
		}

		if (hasError === true) {
			qb.andWhere('requestLog.errorMessage IS NOT NULL');
		}

		if (hasError === false) {
			qb.andWhere('requestLog.errorMessage IS NULL');
		}

		orderAndPaging2({ qb, filter: query });

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	async getDetail(id: string): Promise<RequestLog> {
		const requestLog = await this.repo.findOne({
			where: { id },
		});

		if (!requestLog) {
			throw new NotFoundException('Request log not found');
		}

		return requestLog;
	}

	async delete(id: string) {
		const requestLog = await this.getDetail(id);

		await this.repo.delete(requestLog.id);

		return {
			success: true,
		};
	}

	private sanitizeObject<T = Record<string, any>>(data?: T): T | undefined {
		if (!data || typeof data !== 'object') {
			return data;
		}

		const sensitiveKeys = [
			'authorization',
			'cookie',
			'password',
			'token',
			'accessToken',
			'refreshToken',
			'idToken',
			'apiKey',
			'secret',
		];

		const clone = JSON.parse(JSON.stringify(data));

		const maskRecursive = (obj: any) => {
			if (!obj || typeof obj !== 'object') return;

			for (const key of Object.keys(obj)) {
				const isSensitive = sensitiveKeys.some(
					(sensitiveKey) =>
						key.toLowerCase() === sensitiveKey.toLowerCase() ||
						key.toLowerCase().includes(sensitiveKey.toLowerCase()),
				);

				if (isSensitive) {
					obj[key] = '[MASKED]';
					continue;
				}

				if (typeof obj[key] === 'object') {
					maskRecursive(obj[key]);
				}
			}
		};

		maskRecursive(clone);

		return clone;
	}

	private truncateObject<T = any>(data?: T, maxLength = 5000): T | undefined {
		if (data === undefined || data === null) {
			return data;
		}

		try {
			const text = JSON.stringify(data);

			if (text.length <= maxLength) {
				return data;
			}

			return {
				truncated: true,
				length: text.length,
				preview: text.slice(0, maxLength),
			} as T;
		} catch {
			return {
				truncated: true,
				message: 'Cannot stringify data',
			} as T;
		}
	}
}
