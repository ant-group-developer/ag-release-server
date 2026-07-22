/**
 * CircuitBreakerOpenError — mạch đang OPEN, fail-fast (không gọi service đang sập).
 * Runner để throw → BullMQ retry sau (backoff) → mạch có thời gian half-open thử lại.
 */
export class CircuitBreakerOpenError extends Error {
	constructor(name: string) {
		super(`Circuit breaker '${name}' is OPEN — failing fast`);
		this.name = 'CircuitBreakerOpenError';
	}
}

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
	/** Số lỗi liên tiếp để mở mạch. */
	readonly failureThreshold: number;
	/** Thời gian (ms) giữ OPEN trước khi cho half-open thử lại. */
	readonly cooldownMs: number;
	/** Tên để log + error message. */
	readonly name: string;
}

/**
 * CircuitBreaker — tự viết (không dùng opossum, tránh thêm dep). Bọc external call (CI/SFTP).
 *
 * State machine:
 *   · closed    — cho qua. Lỗi liên tiếp ≥ threshold → open.
 *   · open      — fail-fast (throw CircuitBreakerOpenError). Sau cooldownMs → half-open.
 *   · half-open — cho ĐÚNG 1 request thử: ok → closed (reset); lỗi → open lại.
 *
 * Chỉ đếm lỗi để mở mạch — thành công reset counter. Per-service (CI breaker tách SFTP breaker);
 * per-host là follow-up (spec §Điểm chú ý). Dùng `Date.now()` cho cooldown → inject `now` để test.
 */
export class CircuitBreaker {
	private state: BreakerState = 'closed';
	private consecutiveFailures = 0;
	private openedAt = 0;

	constructor(
		private readonly opts: CircuitBreakerOptions,
		private readonly now: () => number = () => Date.now(),
	) {}

	getState(): BreakerState {
		return this.state;
	}

	async execute<T>(work: () => Promise<T>): Promise<T> {
		if (this.state === 'open') {
			if (this.now() - this.openedAt < this.opts.cooldownMs) {
				throw new CircuitBreakerOpenError(this.opts.name);
			}
			// cooldown hết → cho 1 request thử.
			this.state = 'half-open';
		}

		try {
			const result = await work();
			this.onSuccess();
			return result;
		} catch (err) {
			this.onFailure();
			throw err;
		}
	}

	private onSuccess(): void {
		this.consecutiveFailures = 0;
		this.state = 'closed';
	}

	private onFailure(): void {
		// half-open thử thất bại → mở lại ngay.
		if (this.state === 'half-open') {
			this.trip();
			return;
		}
		this.consecutiveFailures += 1;
		if (this.consecutiveFailures >= this.opts.failureThreshold) {
			this.trip();
		}
	}

	private trip(): void {
		this.state = 'open';
		this.openedAt = this.now();
	}
}
