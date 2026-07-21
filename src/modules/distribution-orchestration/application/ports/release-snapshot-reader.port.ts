/**
 * ReleaseSnapshotReader port — đọc snapshot metadata để validate.
 *
 * Snapshot là bản immutable của Release entity tại thời điểm submit.
 * ValidateRunner cần đọc snapshot (không đọc Release entity trực tiếp)
 * để kiểm tra trường bắt buộc theo bounded context orchestration.
 */
export interface ReleaseSnapshotReader {
	/**
	 * Load snapshot payload by snapshotId.
	 * @returns snapshot payload hoặc null nếu không tồn tại
	 */
	loadById(snapshotId: string): Promise<ReleaseSnapshot | null>;
}

/**
 * ReleaseSnapshot — typed structure của snapshot payload.
 * Chứa metadata cần thiết cho validation.
 */
export interface ReleaseSnapshot {
	readonly id: string;
	readonly releaseId: string;
	readonly title?: string | null;
	readonly upc?: string | null;
	readonly labelId?: string | null;
	readonly primaryGenreId?: string | null;
	readonly albumFormatId?: string | null;
	readonly priceTierId?: string | null;
	readonly cLineYear?: number | null;
	readonly cLineOwner?: string | null;
	readonly pLineYear?: number | null;
	readonly pLineOwner?: string | null;
	readonly releaseDate?: string | null;
	// Nested arrays
	readonly tracks?: Array<{ id: string; title?: string; isrc?: string }>;
	readonly releaseArtists?: Array<{ id: string; name?: string }>;
	readonly releaseCoverArts?: Array<{ id: string; url?: string }>;
	// Territory: OneToOne (không phải mảng) — khớp Release entity thật
	readonly releaseTerritory?: {
		distributeWorldwide?: boolean | null;
		selectedCountries?: string[] | null;
	} | null;
	// Full jsonb payload for future extensibility
	readonly payload: Record<string, unknown>;
}

// DI token
export const RELEASE_SNAPSHOT_READER = Symbol('ReleaseSnapshotReader');
