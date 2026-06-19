export function normalizeUpc(value?: string | null): string {
	const cleaned = value?.trim() ?? '';
	if (!cleaned) return '';
	if (!/^\d+$/.test(cleaned)) return cleaned;

	const normalized = cleaned.replace(/^0+/, '');
	return normalized || '0';
}

export function isValidStandardUpc(value?: string | null): boolean {
	const normalized = normalizeUpc(value);
	return /^\d{10,14}$/.test(normalized);
}

export function normalizeStandardUpcOrEmpty(value?: string | null): string {
	const normalized = normalizeUpc(value);
	return isValidStandardUpc(normalized) ? normalized : '';
}

export function normalizeReportUpcOrFallback(
	upc?: string | null,
	isrc?: string | null,
): string {
	const normalizedUpc = normalizeUpc(upc);
	if (normalizedUpc) return normalizedUpc;

	const normalizedIsrc = normalizeReportIsrc(isrc);
	return normalizedIsrc ? `ISRC-${normalizedIsrc}` : '';
}

export function buildEquivalentUpcs(value?: string | null): string[] {
	const normalized = normalizeUpc(value);
	if (!normalized) return [];
	if (!/^\d+$/.test(normalized)) return [normalized];

	const variants = new Set<string>([normalized]);
	for (const length of [12, 13, 14]) {
		if (normalized.length <= length) {
			variants.add(normalized.padStart(length, '0'));
		}
	}

	return [...variants];
}

function normalizeReportIsrc(value?: string | null): string {
	const cleaned = value?.trim().toUpperCase() ?? '';
	if (!cleaned || cleaned === 'N/A' || cleaned.startsWith('UPC-')) return '';
	return cleaned;
}
