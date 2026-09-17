import { retryLimitExceeded } from '../errors/distribution-v2-domain.error';

export interface RetryPolicyInput {
	readonly maxRetries?: number;
}

export class RetryPolicyV2 {
	readonly maxRetries: number;

	constructor(input: RetryPolicyInput = {}) {
		const maxRetries = input.maxRetries ?? 3;
		if (!Number.isInteger(maxRetries) || maxRetries < 0) {
			throw new Error(
				'RetryPolicyV2.maxRetries must be a non-negative integer',
			);
		}
		this.maxRetries = maxRetries;
	}

	canRetry(retryCount: number): boolean {
		return retryCount < this.maxRetries;
	}

	assertCanRetry(entity: string, retryCount: number): void {
		if (!this.canRetry(retryCount)) {
			throw retryLimitExceeded(entity, retryCount, this.maxRetries);
		}
	}
}

export { RetryPolicyV2 as RetryPolicy };
