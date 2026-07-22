/**
 * TimeoutError — external call vượt deadline. Runner để nó throw → BullMQ retry (transient).
 */
export class TimeoutError extends Error {
	constructor(label: string, ms: number) {
		super(`${label} timed out after ${ms}ms`);
		this.name = 'TimeoutError';
	}
}

/**
 * withTimeout — bọc 1 external call bằng deadline (Promise.race).
 *
 * Bước treo vô hạn (SFTP/gRPC/CI) → sau `ms` throw TimeoutError → BullMQ retry theo backoff;
 * cạn attempts → ISSUES (Khối C/E). KHÔNG hủy được promise gốc (JS không cancel Promise), nhưng
 * runner đã nhả worker → không giữ tài nguyên. Timer luôn được clear để tránh leak + treo test.
 */
export function withTimeout<T>(
	work: Promise<T>,
	ms: number,
	label: string,
): Promise<T> {
	let timer: NodeJS.Timeout;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
	});
	return Promise.race([work, timeout]).finally(() =>
		clearTimeout(timer),
	) as Promise<T>;
}
