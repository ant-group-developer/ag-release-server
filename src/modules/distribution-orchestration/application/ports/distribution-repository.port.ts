import { Distribution } from '../../domain/distribution/distribution.aggregate';
import { DomainEvent } from '../../domain/events/domain-event.base';
import { OutboxEntry } from './outbox-entry';
import { TxContext } from './unit-of-work.port';

/**
 * DistributionRepository — port truy cập persistence cho aggregate.
 *
 * load() = SELECT + rehydrate → trả Distribution aggregate sẵn sàng gọi transition.
 * saveWithOutbox() = 1 transaction: UPDATE state (optlock) + UPSERT channels
 *   + INSERT events + INSERT outbox → adapter đảm bảo atomic.
 *
 * Cả 2 method nhận TxContext từ UnitOfWork.run() — repo KHÔNG tự mở transaction.
 */
export interface DistributionRepository {
	load(ctx: TxContext, id: string): Promise<Distribution | null>;
	saveWithOutbox(
		ctx: TxContext,
		dist: Distribution,
		events: DomainEvent[],
		outbox: OutboxEntry[],
	): Promise<void>;
}

// ── DI token ──
export const DISTRIBUTION_REPOSITORY = Symbol('DistributionRepository');
