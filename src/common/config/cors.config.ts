import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { getPrimaryDomains, normalizeDomain } from './domain.config';

export const buildPrimaryDomainRegexes = (): RegExp[] => {
	const allowedDomains = getPrimaryDomains();

	return allowedDomains.map((domain) => {
		const escaped = domain.replace(/\./g, '\\.');
		// Allows optional port suffix (e.g. :3000) for local development
		return new RegExp(`^https?:\\/\\/${escaped}(:\\d+)?$`);
	});
};

const extractHost = (origin: string): string => {
	return normalizeDomain(origin);
};

const extractHostname = (origin: string): string => {
	const domain = normalizeDomain(origin);
	return domain.split(':')[0];
};

/** Static config — used before app fully initialises (fallback) */
export const corsConfig = (): CorsOptions => ({
	origin: buildPrimaryDomainRegexes(),
	credentials: true,
});

/** Dynamic config with DB-backed custom domain lookup.
 *  Call this after the NestJS app is fully created so services are available.
 */
export const createDynamicCorsConfig = (
	findActiveByDomain: (domain: string) => Promise<unknown>,
): CorsOptions => {
	const primaryDomains = getPrimaryDomains();
	const cache = new Map<string, { allowed: boolean; expiresAt: number }>();
	const CACHE_TTL = 5 * 60 * 1000;

	return {
		origin: async (origin, callback) => {
			if (!origin) return callback(null, true);

			const domain = extractHost(origin);         // e.g. "localhost:3000" or "release.quizonline.website"
			const hostname = extractHostname(origin);   // e.g. "localhost" or "release.quizonline.website"

			// 1. Auto-allow localhost in development
			if (process.env.NODE_ENV === 'development' && hostname === 'localhost') {
				return callback(null, true);
			}

			// 2. Static primary domains (check both with and without port)
			if (primaryDomains.includes(domain) || primaryDomains.includes(hostname)) {
				return callback(null, true);
			}

			const now = Date.now();

			// 2. Cache hit
			const cached = cache.get(domain);
			if (cached && cached.expiresAt > now) {
				return callback(null, cached.allowed);
			}

			// 3. DB lookup (query using hostname to match the DB record without port)
			const record = await findActiveByDomain(hostname).catch(() => null);
			const allowed = !!record;
			cache.set(domain, { allowed, expiresAt: now + CACHE_TTL });

			callback(null, allowed);
		},
		credentials: true,
	};
};
