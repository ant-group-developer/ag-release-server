import { normalizeMetadataExternal } from 'src/modules/release/utils/release.utils';

export function normalizeSyncedMetadataExternal(
	metadataSpotify: string | null | undefined,
	metadataDeezer: string | null | undefined,
): Record<string, unknown> {
	return normalizeMetadataExternal({
		metadataSpotify: parseSyncedMetadata(metadataSpotify),
		metadataDeezer: parseSyncedMetadata(metadataDeezer),
	}).metadataExternal;
}

function parseSyncedMetadata(value: string | null | undefined): unknown {
	if (!value) return undefined;

	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}
