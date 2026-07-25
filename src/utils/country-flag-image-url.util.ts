/** Turns a country flag key stored in PostgreSQL into its public R2 URL. */
export function toCountryFlagImageUrl(key?: string | null): string | null {
	if (!key) return null;
	if (key.startsWith('http')) return key;

	const baseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
	return baseUrl ? baseUrl + '/' + key : null;
}
