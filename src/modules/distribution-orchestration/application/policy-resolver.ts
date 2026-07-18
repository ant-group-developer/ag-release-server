import { ExecutionPolicy } from '../domain/policies/execution-policy.port';
import { InitialReleasePolicy } from '../domain/policies/initial-release.policy';
import { RetryExecutionPolicy } from '../domain/policies/retry-execution.policy';
import { TakedownPolicy } from '../domain/policies/takedown.policy';
import { UpdatePolicy } from '../domain/policies/update.policy';
import { ExecutionTypeEnum } from '../domain/value-objects/execution-type.enum';

/**
 * PolicyResolver — ánh xạ ExecutionType → ExecutionPolicy instance.
 *
 * Aggregate KHÔNG giữ policy (policy tách khỏi state để process-as-data). Handler
 * + step-runners resolve policy tại thời điểm cần (markValidated, resetForRetry,
 * markPackageBuilt, markTakenDown).
 *
 * RETRY = wrap policy gốc (theo `wrappedType`). Chỉ dùng khi aggregate có sẵn
 * `wrappedType` (đọc từ column phụ). Step 4 chưa xử lý RETRY — chờ khi handler
 * cần retry mới bổ sung tham số wrappedType vào signature.
 */
export interface PolicyResolver {
	resolve(type: ExecutionTypeEnum): ExecutionPolicy;
}

export class DefaultPolicyResolver implements PolicyResolver {
	resolve(type: ExecutionTypeEnum): ExecutionPolicy {
		switch (type) {
			case ExecutionTypeEnum.INITIAL_RELEASE:
				return new InitialReleasePolicy();
			case ExecutionTypeEnum.UPDATE:
				return new UpdatePolicy();
			case ExecutionTypeEnum.TAKEDOWN:
				return new TakedownPolicy();
			case ExecutionTypeEnum.RETRY:
				// TẠM: wrap INITIAL. Step 5+ mở rộng: đọc wrappedType từ DB.
				return new RetryExecutionPolicy(new InitialReleasePolicy());
		}
	}
}

export const POLICY_RESOLVER = Symbol('PolicyResolver');
