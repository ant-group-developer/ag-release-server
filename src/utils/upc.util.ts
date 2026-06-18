export function normalizeUpc(value?: string | null): string {
	const cleaned = value?.trim() ?? '';
	if (!cleaned) return '';
	if (!/^\d+$/.test(cleaned)) return cleaned;

	const normalized = cleaned.replace(/^0+/, '');
	return normalized || '0';
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
