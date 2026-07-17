import { OptimisticLockError } from '../../application/errors/optimistic-lock.error';
import { DistributionRepository } from '../../application/ports/distribution-repository.port';
import { OutboxEntry } from '../../application/ports/outbox-entry';
import { TxContext } from '../../application/ports/unit-of-work.port';
import { Distribution } from '../../domain/distribution/distribution.aggregate';
import { DomainEvent } from '../../domain/events/domain-event.base';

/**
 * InMemoryDistributionRepository — test double cho DistributionRepository.
 *
 * Lưu:
 *   · aggregates       — Map<id, Distribution> (giả bảng distribution + channel_delivery)
 *   · versions         — Map<id, number>       (mô phỏng optimistic lock cột version)
 *   · savedEvents      — DomainEvent[]         (giả bảng distribution_event)
 *   · savedOutbox      — OutboxEntry[]         (giả bảng outbox_event)
 *
 * Semantics khớp adapter thật:
 *   · load() trả bản deep-clone? KHÔNG — trả instance đã lưu, test tự bảo bảo aggregate
 *     sau saveWithOutbox thì không mutate. Nếu cần "load → 2 instance độc lập" (case
 *     concurrent), test gọi load 2 lần và nhận 2 aggregate; Distribution có state riêng
 *     trong closure của constructor nên 2 load sau khi save+rehydrate là 2 object khác.
 *
 * Optimistic lock mô phỏng:
 *   · aggregate.version=0 (fresh) → INSERT: versions.set(id, 1)
 *   · aggregate.version=N (loaded) → check versions.get(id) === N: match → set N+1
 *     mismatch → throw OptimisticLockError.
 *
 * Rehydrate on load:
 *   Trả về aggregate rehydrate từ snapshot vừa lưu — mimic được contract của repo thật
 *   (load → 2 instance độc lập, sau load version = latest). Handler test cần điều này
 *   để giữa 2 turn, aggregate được load lại với version mới nhất.
 */
export class InMemoryDistributionRepository implements DistributionRepository {
	private readonly aggregates = new Map<string, Distribution>();
	private readonly versions = new Map<string, number>();

	readonly savedEvents: DomainEvent[] = [];
	readonly savedOutbox: OutboxEntry[] = [];

	async load(_ctx: TxContext, id: string): Promise<Distribution | null> {
		const existing = this.aggregates.get(id);
		if (!existing) return null;
		// clone bằng cách rehydrate từ snapshot của existing (giữ separation giữa các load)
		return cloneViaRehydrate(existing, this.versions.get(id) ?? 0);
	}

	async saveWithOutbox(
		_ctx: TxContext,
		dist: Distribution,
		events: DomainEvent[],
		outbox: OutboxEntry[],
	): Promise<void> {
		const currentDbVersion = this.versions.get(dist.id) ?? 0;

		if (dist.version === 0) {
			// INSERT fresh — nếu đã tồn tại row cùng id với version >= 1 → xung đột INSERT
			if (currentDbVersion !== 0) {
				throw new OptimisticLockError(dist.id, 0);
			}
			this.versions.set(dist.id, 1);
		} else {
			// UPDATE optlock — expectedVersion phải khớp
			if (currentDbVersion !== dist.version) {
				throw new OptimisticLockError(dist.id, dist.version);
			}
			this.versions.set(dist.id, currentDbVersion + 1);
		}

		this.aggregates.set(dist.id, dist);
		this.savedEvents.push(...events);
		this.savedOutbox.push(...outbox);
	}

	// ── test helpers ──

	reset(): void {
		this.aggregates.clear();
		this.versions.clear();
		this.savedEvents.length = 0;
		this.savedOutbox.length = 0;
	}

	getVersion(id: string): number {
		return this.versions.get(id) ?? 0;
	}
}

/**
 * Clone aggregate bằng cách rehydrate từ snapshot row + channels.
 * Đây là cách repo thật trả ra 2 instance độc lập sau 2 load — mimic ở đây.
 */
function cloneViaRehydrate(src: Distribution, dbVersion: number): Distribution {
	return Distribution.rehydrate(
		{
			id: src.id,
			releaseId: src.releaseId,
			snapshotId: src.snapshotId,
			tenantId: src.tenantId,
			type: src.type,
			correlationId: src.correlationId,
			state: src.state,
			upc: src.upc,
			packageUri: src.packageUri,
			retryCount: src.retryCount,
			version: dbVersion,
		},
		// Channels: rehydrate từ chính src.channels — giữ instance vì channel state là
		// milestone của aggregate; test-double không cần deep-clone (test hiện tại của
		// Step 4 chỉ chạy submit + markValidated, chưa spawn channel).
		[...src.channels],
	);
}
