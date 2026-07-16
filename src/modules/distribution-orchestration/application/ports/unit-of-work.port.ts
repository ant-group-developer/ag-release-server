/**
 * TxContext — context bind trong 1 transaction. Handler nhận qua callback của uow.run().
 *
 * Bắt đầu RỖNG có chủ đích: sẽ được mở rộng khi định nghĩa các repo port
 * (DistributionRepository, ChannelDeliveryRepository, DomainEventStore, OutboxWriter).
 * Handler KHÔNG import TypeORM QueryRunner/EntityManager — chỉ dùng repo trên ctx.
 *
 * Adapter TypeORM (Phase 2 sau) sẽ:
 *   1. mở QueryRunner + startTransaction()
 *   2. build ctx với repo TypeORM-flavor bind vào QueryRunner
 *   3. gọi work(ctx) trong transaction, commit/rollback
 */
export interface TxContext {
	// intentionally empty — repo bindings added incrementally in later steps
	// (P2 write side: distRepo, channelRepo, eventStore, outboxWriter)
}

/**
 * UnitOfWork — trừu tượng transaction. 1 uow.run() = 1 transaction Postgres.
 * Handler gọi để nhóm nhiều thao tác DB thành atomic (xem trace bước 4).
 *
 * Adapter:
 *   - InMemoryUnitOfWork (Phase 2 Nhịp 1.4 test): chạy callback không transac
 *   - TypeOrmUnitOfWork (Phase 2 Step 3): dùng QueryRunner + startTransaction().
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
