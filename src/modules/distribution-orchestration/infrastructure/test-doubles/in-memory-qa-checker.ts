import { QaChecker, QaResult } from '../../domain/ports/qa-checker.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';

/**
 * InMemoryQaChecker — test double cho QaChecker. Mặc định 'clean'; `setResult()` mô phỏng flag.
 */
export class InMemoryQaChecker implements QaChecker {
	private readonly resultByUpc = new Map<string, QaResult>();
	private readonly defaultResult: QaResult = { kind: 'clean' };

	setResult(upc: string, result: QaResult): void {
		this.resultByUpc.set(upc, result);
	}

	async check(input: {
		upc: string;
		key: IdempotencyKey;
	}): Promise<QaResult> {
		return this.resultByUpc.get(input.upc) ?? this.defaultResult;
	}
}
