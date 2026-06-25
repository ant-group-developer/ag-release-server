import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const buildPrimaryDomainRegexes = (): RegExp[] => {
	const originsEnv = process.env.CORS_ORIGINS || '';
	const allowedDomains = originsEnv
		.split(',')
		.map((d) => d.trim())
		.filter((d) => d.length > 0);

	return allowedDomains.map((domain) => {
		const escaped = domain.replace(/\./g, '\\.');
		return new RegExp(`^https?:\\/\\/(.*\\.)?${escaped}$`);
	});
};

const extractHost = (origin: string): string => {
	try {
		return new URL(origin).host;
	} catch {
		return origin;
	}
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
	const primaryRegexes = buildPrimaryDomainRegexes();
	const cache = new Map<string, { allowed: boolean; expiresAt: number }>();
	const CACHE_TTL = 5 * 60 * 1000;

	return {
		origin: async (origin, callback) => {
			if (!origin) return callback(null, true);

			// 1. Static primary domains
			if (primaryRegexes.some((r) => r.test(origin))) {
				return callback(null, true);
			}

			const domain = extractHost(origin);
			const now = Date.now();

			// 2. Cache hit
			const cached = cache.get(domain);
			if (cached && cached.expiresAt > now) {
				return callback(cached.allowed ? null : new Error('CORS'), cached.allowed);
			}

			// 3. DB lookup
			const record = await findActiveByDomain(domain).catch(() => null);
			const allowed = !!record;
			cache.set(domain, { allowed, expiresAt: now + CACHE_TTL });

			callback(allowed ? null : new Error('CORS'), allowed);
		},
		credentials: true,
	};
};

