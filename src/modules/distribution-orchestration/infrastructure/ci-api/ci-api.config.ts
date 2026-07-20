/**
 * CI API Configuration for Distribution Orchestration module.
 *
 * Provides config interface and injection token for CI API services.
 * Separate from v3 partners-api module to maintain clean boundaries.
 */
export interface CiApiConfig {
	/** Base URL for CI API (e.g., 'https://api.openimp.com') */
	readonly baseUrl: string;

	/** CI Organisation ID (e.g., '52978127640016') */
	readonly organisationId: string;

	/** Bearer token for authentication */
	readonly token: string;

	/** Request timeout in milliseconds (default: 30000) */
	readonly timeout?: number;
}

export const CI_API_CONFIG = Symbol('CI_API_CONFIG');
