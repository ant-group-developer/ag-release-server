// request-tracking/interceptors/request-tracking.interceptor.ts

import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import { RequestTrackingService } from './request-tracking.service';

@Injectable()
export class RequestTrackingInterceptor implements NestInterceptor {
	private readonly enabled = true;

	private readonly ignoreRoutes = [
		'/health',
		'/metrics',
		'/favicon.ico',
		'/request-tracking',
		'/app-config/v2/public',
	];

	private readonly ignoreMethods = ['OPTIONS'];

	private readonly ignoreStatusCodes = [304];

	private readonly saveHeaders = true;
	private readonly saveRequestBody = true;
	private readonly saveResponseBody = false;

	private readonly onlySaveError = false;

	constructor(
		private readonly requestTrackingService: RequestTrackingService,
	) {}

	intercept(context: ExecutionContext, next: CallHandler) {
		const ctx = context.switchToHttp();
		const req = ctx.getRequest<Request & { user?: any }>();
		const res = ctx.getResponse<Response>();

		const startedAt = Date.now();

		const method = req.method;
		const url = req.originalUrl || req.url;
		const route = req.route?.path
			? `${req.baseUrl || ''}${req.route.path}`
			: req.path;

		if (this.shouldSkipRequest({ method, url, route })) {
			return next.handle();
		}

		const ip =
			(req.headers['x-forwarded-for'] as string)
				?.split(',')?.[0]
				?.trim() || req.ip;

		const userAgent = req.headers['user-agent'];

		const userId = req.user?.id;
		const userRole = req.user?.role || req.user?.type;

		return next.handle().pipe(
			tap((responseBody) => {
				const duration = Date.now() - startedAt;
				const statusCode = res.statusCode;

				if (
					this.shouldSkipResponse({
						statusCode,
						hasError: false,
					})
				) {
					return;
				}

				void this.requestTrackingService.createSafe({
					method,
					url,
					route,
					ip,
					userAgent,

					headers: this.saveHeaders ? req.headers : undefined,
					body: this.saveRequestBody ? req.body : undefined,
					query: req.query,
					params: req.params,

					userId,
					userRole,

					statusCode,
					responseBody: this.saveResponseBody
						? responseBody
						: undefined,
					duration,
				});
			}),

			catchError((error) => {
				const duration = Date.now() - startedAt;
				const statusCode = error?.status || 500;

				if (
					this.shouldSkipResponse({
						statusCode,
						hasError: true,
					})
				) {
					return throwError(() => error);
				}

				void this.requestTrackingService.createSafe({
					method,
					url,
					route,
					ip,
					userAgent,

					headers: this.saveHeaders ? req.headers : undefined,
					body: this.saveRequestBody ? req.body : undefined,
					query: req.query,
					params: req.params,

					userId,
					userRole,

					statusCode,

					errorMessage: error?.message,
					errorName: error?.name,
					errorStack: statusCode >= 500 ? error?.stack : undefined,
					errorCause: error?.cause,

					duration,
				});

				return throwError(() => error);
			}),
		);
	}

	private shouldSkipRequest({
		method,
		url,
		route,
	}: {
		method: string;
		url: string;
		route: string;
	}): boolean {
		if (!this.enabled) {
			return true;
		}

		if (this.ignoreMethods.includes(method)) {
			return true;
		}

		return this.ignoreRoutes.some((ignoreRoute) => {
			return url.startsWith(ignoreRoute) || route.startsWith(ignoreRoute);
		});
	}

	private shouldSkipResponse({
		statusCode,
		hasError,
	}: {
		statusCode: number;
		hasError: boolean;
	}): boolean {
		if (this.ignoreStatusCodes.includes(statusCode)) {
			return true;
		}

		if (this.onlySaveError && !hasError) {
			return true;
		}

		return false;
	}
}
