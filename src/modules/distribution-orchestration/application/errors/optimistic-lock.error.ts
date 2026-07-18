/**
 * OptimisticLockError — ném khi UPDATE distribution ... WHERE version=? affect 0 rows.
 *
 * Handler bắt error → BullMQ retry job → repo.load lại (version mới) → apply lại.
 * Đây là cơ chế xử lý concurrent write cấp application, không phải domain.
 */
export class OptimisticLockError extends Error {
	constructor(
		public readonly distributionId: string,
		public readonly expectedVersion: number,
	) {
		super(
			`Distribution ${distributionId} was updated concurrently (expected version ${expectedVersion})`,
		);
		this.name = 'OptimisticLockError';
	}
}
