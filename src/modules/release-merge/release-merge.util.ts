import { buildEquivalentUpcs } from 'src/utils/upc.util';

export function normalizeMergeIsrc(value: string | null | undefined): string {
	return (value ?? '').replace(/[\s-]/g, '').toUpperCase();
}

export function isRealIsrc(value: string | null | undefined): boolean {
	return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalizeMergeIsrc(value));
}

export function areEquivalentUpcs(
	left: string | null | undefined,
	right: string | null | undefined,
): boolean {
	if (!left || !right) return false;
	const rightVariants = new Set(buildEquivalentUpcs(right));
	return buildEquivalentUpcs(left).some((value) => rightVariants.has(value));
}

export function isReportPlaceholderUpc(
	value: string | null | undefined,
): boolean {
	return !!value && /^ISRC-/i.test(value.trim());
}
