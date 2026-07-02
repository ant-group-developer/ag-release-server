const splitDomainList = (value: string): string[] =>
	value
		.split(',')
		.map((domain) => normalizeDomain(domain))
		.filter((domain) => domain.length > 0);

export const normalizeDomain = (value?: string | null): string => {
	if (!value) return '';

	const raw = value.trim();
	if (!raw) return '';

	let host = raw;
	try {
		if (/^[a-z][a-z\d+\-.]*:\/\//i.test(raw)) {
			host = new URL(raw).host;
		} else if (raw.startsWith('//')) {
			host = new URL(`http:${raw}`).host;
		} else {
			host = raw.split(/[/?#]/)[0];
		}
	} catch {
		host = raw.split(/[/?#]/)[0];
	}

	return host.trim().replace(/\.+$/, '').toLowerCase();
};

export const getPrimaryDomains = (): string[] => {
	const source = process.env.PRIMARY_DOMAINS || process.env.CORS_ORIGINS || '';
	return Array.from(new Set(splitDomainList(source)));
};

export const isPrimaryDomain = (domain: string): boolean => {
	const normalized = normalizeDomain(domain);
	return !!normalized && getPrimaryDomains().includes(normalized);
};
