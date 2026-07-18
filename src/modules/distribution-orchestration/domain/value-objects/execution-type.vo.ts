import { ExecutionTypeEnum } from './execution-type.enum';

/**
 * ExecutionType — wraps `ExecutionTypeEnum` to expose `is*()` helpers that read cleanly
 * in the aggregate/policy. Keeps the enum value as-is (matching v3) — adds semantics only, no data.
 */
export class ExecutionType {
	private constructor(public readonly value: ExecutionTypeEnum) {}

	static of(v: ExecutionTypeEnum): ExecutionType {
		return new ExecutionType(v);
	}

	get isInitial(): boolean {
		return this.value === ExecutionTypeEnum.INITIAL_RELEASE;
	}
	get isUpdate(): boolean {
		return this.value === ExecutionTypeEnum.UPDATE;
	}
	get isTakedown(): boolean {
		return this.value === ExecutionTypeEnum.TAKEDOWN;
	}
	get isRetry(): boolean {
		return this.value === ExecutionTypeEnum.RETRY;
	}

	equals(o: ExecutionType): boolean {
		return this.value === o.value;
	}
}
