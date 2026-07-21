/**
 * ReleaseSnapshotWriter port — tạo snapshot bất biến lúc submit.
 *
 * Chụp toàn bộ Release entity (+ relations) thành 1 jsonb row immutable trong
 * `release_snapshot`. Mọi bước sau chạy trên snapshot → user sửa release gốc
 * KHÔNG phá luồng đang chạy (spec §5, quyết định kiến trúc 2026-07-13).
 *
 * Application chỉ biết port này; adapter (infrastructure) bọc ReleaseQueryService.
 */
export interface ReleaseSnapshotWriter {
	/**
	 * Tạo snapshot cho release. Trả snapshotId (uuid) vừa tạo.
	 * @throws nếu release không tồn tại.
	 */
	createFromRelease(releaseId: string): Promise<string>;
}

// DI token
export const RELEASE_SNAPSHOT_WRITER = Symbol('ReleaseSnapshotWriter');
