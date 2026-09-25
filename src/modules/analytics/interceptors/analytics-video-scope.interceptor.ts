import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AnalyticsVideoScopeService } from '../services/analytics-video-scope.service';

/** Attaches a server-resolved scope to analytics DTOs; clients cannot choose it. */
@Injectable()
export class AnalyticsVideoScopeInterceptor implements NestInterceptor {
	constructor(private readonly scopeService: AnalyticsVideoScopeService) {}

	async intercept(
		context: ExecutionContext,
		next: CallHandler,
	): Promise<Observable<unknown>> {
		const request = context.switchToHttp().getRequest();
		const path = request.path || request.originalUrl || request.url || '';
		if (!path.startsWith('/analytics') && !path.startsWith('/analytic')) {
			return next.handle();
		}

		const scope = await this.scopeService.resolve(request.user);
		request.body = request.body || {};
		request.body.analyticsVideoScope = scope;

		if (request.params?.channelId) {
			this.scopeService.assertChannelAccess(
				scope,
				request.params.channelId,
			);
		} else if (request.params?.releaseId) {
			await this.scopeService.assertReleaseAccess(
				scope,
				request.params.releaseId,
			);
		} else if (request.params?.isrc) {
			await this.scopeService.assertIsrcAccess(
				scope,
				request.params.isrc,
			);
		}

		if (request.body.channelId) {
			this.scopeService.assertChannelAccess(
				scope,
				request.body.channelId,
			);
		}
		if (request.body.releaseId) {
			await this.scopeService.assertReleaseAccess(
				scope,
				request.body.releaseId,
			);
		}
		if (request.body.isrc) {
			await this.scopeService.assertIsrcAccess(scope, request.body.isrc);
		}

		const filters = request.body.filters;
		if (filters && typeof filters === 'object') {
			const channelIds = Array.isArray(filters.channelIds)
				? filters.channelIds
				: [];
			const releaseIds = Array.isArray(filters.releaseIds)
				? filters.releaseIds
				: [];
			const isrcs = Array.isArray(filters.isrcs) ? filters.isrcs : [];

			for (const channelId of channelIds) {
				if (typeof channelId === 'string') {
					this.scopeService.assertChannelAccess(scope, channelId);
				}
			}
			for (const releaseId of releaseIds) {
				if (typeof releaseId === 'string') {
					await this.scopeService.assertReleaseAccess(
						scope,
						releaseId,
					);
				}
			}
			for (const isrc of isrcs) {
				if (typeof isrc === 'string') {
					await this.scopeService.assertIsrcAccess(scope, isrc);
				}
			}
		}

		return next.handle();
	}
}
