import { InvariantViolationError } from '../errors/domain-errors';

export type RetryStrategy = 'fixed' | 'exponential';

/**
 * RetryPolicy — retry parameters for one ACTION stage (e.g. SFTP upload ≤3 times).
 *
 * The domain ONLY holds the parameters + answers `canRetry()`. The actual backoff/scheduling
 * belongs to the engine (phase 2) — the domain does not sleep or track time.
 *
 * ⚠ Do not confuse with `RetryExecutionPolicy` (a distribution-level strategy). Same word
 * "retry" but a different tier: this VO = backoff for one stage; that policy = whether a subtree can be reset.
 */
export class RetryPolicy {
	private constructor(
		public readonly maxAttempts: number,
		public readonly backoffMs: number,
		public readonly strategy: RetryStrategy,
	) {}

	/** SFTP default per spec: 3 attempts, exponential backoff from 30s. */
	static sftpDefault(): RetryPolicy {
		return new RetryPolicy(3, 30_000, 'exponential');
	}

	static create(
		maxAttempts: number,
		backoffMs: number,
		strategy: RetryStrategy,
	): RetryPolicy {
		if (maxAttempts < 1) {
			throw new InvariantViolationError(
				'RetryPolicy',
				'maxAttempts >= 1',
			);
		}
		if (backoffMs < 0) {
			throw new InvariantViolationError('RetryPolicy', 'backoffMs >= 0');
		}
		return new RetryPolicy(maxAttempts, backoffMs, strategy);
	}

	/** Whether another attempt is allowed: currentCount is the number of attempts already failed. */
	canRetry(currentCount: number): boolean {
		return currentCount < this.maxAttempts;
	}

	equals(o: RetryPolicy): boolean {
		return (
			this.maxAttempts === o.maxAttempts &&
			this.backoffMs === o.backoffMs &&
			this.strategy === o.strategy
		);
	}
}
