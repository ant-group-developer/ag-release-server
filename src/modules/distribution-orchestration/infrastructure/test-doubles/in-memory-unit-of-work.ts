import {
	TxContext,
	UnitOfWork,
} from '../../application/ports/unit-of-work.port';

/**
 * InMemoryUnitOfWork — test double cho UnitOfWork.
 *
 * KHÔNG có transaction thật (không có EntityManager). Chạy callback trực tiếp,
 * nhả context với `manager` = null-object (repo test-double cũng không đọc manager).
 *
 * Rollback fake: nếu callback throw, throw ngược — không có cơ chế undo mutation
 * trong repo test-double (giả định handler test không dựa vào rollback partial).
 * Case cần assert rollback (throw giữa chừng) → dùng integration test thật.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
	async run<T>(work: (ctx: TxContext) => Promise<T>): Promise<T> {
		// manager không được đọc bởi test-double repo — cast qua unknown để không đụng typing TypeORM
		const ctx = { manager: {} as TxContext['manager'] };
		return work(ctx);
	}
}
