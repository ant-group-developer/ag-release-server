import { EntityManager } from 'typeorm';

/**
 * TxContext — context bind trong 1 transaction (UnitOfWork mở).
 * Handler nhận qua callback của uow.run() và truyền xuống Repository.
 *
 * Application layer PHỤ THUỘC TypeORM `EntityManager` ở đây (chấp nhận):
 *   - Application đã biết ngữ cảnh persistence (khác domain thuần).
 *   - Trừu tượng hơn (port `TxContext.query()` riêng) tăng phức tạp không đáng.
 *   - Guard `no-framework-import` chỉ áp domain/, không áp application/.
 */
export interface TxContext {
	readonly manager: EntityManager;
}

/**
 * UnitOfWork — trừu tượng transaction. 1 uow.run() = 1 transaction Postgres.
 * Handler gọi để nhóm nhiều thao tác DB thành atomic (xem trace bước 4).
 *
 * Adapter:
 *   - InMemoryUnitOfWork (test): chạy callback không transaction thật.
 *   - TypeOrmUnitOfWork (Nhịp 2.5): dùng QueryRunner + startTransaction().
 */
export interface UnitOfWork {
	/**
	 * Chạy work trong 1 transaction. Callback throw → rollback + rethrow.
	 * Callback resolve → commit + trả giá trị.
	 *
	 * Generic T: handler có thể lấy giá trị ra khỏi transaction
	 * (VD upc mới cấp) qua return của callback.
	 */
	run<T>(work: (ctx: TxContext) => Promise<T>): Promise<T>;
}

// ── DI token (NestJS: bind interface qua Symbol) ──
export const UNIT_OF_WORK = Symbol('UnitOfWork');
