import { QaChecker, QaResult } from '../../domain/ports/qa-checker.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';

/**
 * InMemoryQaChecker — test double cho QaChecker. Mặc định 'clean'; `setResult()` mô phỏng flag.
 */
export class InMemoryQaChecker implements QaChecker {
	private readonly resultByRelease = new Map<string, QaResult>();
	private readonly defaultResult: QaResult = { kind: 'clean' };

	setResult(releaseId: string, result: QaResult): void {
		this.resultByRelease.set(releaseId, result);
	}

	async check(input: {
		releaseId: string;
		key: IdempotencyKey;
	}): Promise<QaResult> {
		return this.resultByRelease.get(input.releaseId) ?? this.defaultResult;
	}
}
