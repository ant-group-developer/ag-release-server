/**
 * AggregateNotFoundError — ném khi command non-SUBMIT chạy vào repo.load() = null.
 *
 * Handler bắt error → không retry (không có gì để load ở turn kế). Nếu do race
 * (SUBMIT + MARK_VALIDATED enqueue song song, MARK_VALIDATED tới queue trước),
 * BullMQ retry với backoff sẽ tự resolve khi SUBMIT persist xong.
 */
export class AggregateNotFoundError extends Error {
	constructor(public readonly distributionId: string) {
		super(`Distribution ${distributionId} not found`);
		this.name = 'AggregateNotFoundError';
	}
}
