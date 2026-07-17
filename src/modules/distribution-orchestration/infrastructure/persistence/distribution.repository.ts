import { Injectable } from '@nestjs/common';
import { OptimisticLockError } from '../../application/errors/optimistic-lock.error';
import { DistributionRepository } from '../../application/ports/distribution-repository.port';
import { OutboxEntry } from '../../application/ports/outbox-entry';
import { TxContext } from '../../application/ports/unit-of-work.port';
import {
	ChannelDeliverySpec,
	ExportMethod,
} from '../../domain/channel-delivery/channel-delivery-spec';
import {
	ChannelDelivery,
	ChannelDeliveryRow,
} from '../../domain/channel-delivery/channel-delivery.entity';
import { ChannelState } from '../../domain/channel-delivery/channel-state.enum';
import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { Distribution } from '../../domain/distribution/distribution.aggregate';
import { DistributionSnapshotRow } from '../../domain/distribution/distribution.types';
import { DomainEvent } from '../../domain/events/domain-event.base';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { ChannelDeliveryOrmEntity } from './channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from './distribution-event.orm-entity';
import { DistributionOrmEntity } from './distribution.orm-entity';
import { OutboxEventOrmEntity } from './outbox-event.orm-entity';

/**
 * DistributionRepository (TypeORM adapter) — CỐT LÕI Nhịp 2.4.
 *
 * load()             = SELECT distribution + channels (song song) → rehydrate aggregate
 * saveWithOutbox()   = 1 transaction (do UoW mở):
 *                      · UPDATE distribution SET version=version+1 WHERE version=? (optlock)
 *                      · UPSERT channel_delivery
 *                      · INSERT distribution_event (mọi event từ pullDomainEvents)
 *                      · INSERT outbox_event (nếu có)
 *
 * Cả 2 method NHẬN ctx từ ngoài — repo KHÔNG tự mở transaction (đảm bảo atomic 4 bảng).
 */
@Injectable()
export class TypeOrmDistributionRepository implements DistributionRepository {
	async load(ctx: TxContext, id: string): Promise<Distribution | null> {
		const distRepo = ctx.manager.getRepository(DistributionOrmEntity);
		const chanRepo = ctx.manager.getRepository(ChannelDeliveryOrmEntity);

		// 2 query song song — cost tương đương JOIN với N nhỏ, code sạch hơn
		const [distRow, chanRows] = await Promise.all([
			distRepo.findOne({ where: { id } }),
			chanRepo.find({
				where: { distributionId: id },
				order: { spawnOrder: 'ASC' },
			}),
		]);
		if (!distRow) return null;

		const channels = chanRows.map((r) =>
			ChannelDelivery.rehydrate(toSpec(r), toChannelRow(r)),
		);
		return Distribution.rehydrate(toDistRow(distRow), channels);
	}

	async saveWithOutbox(
		ctx: TxContext,
		dist: Distribution,
		events: DomainEvent[],
		outbox: OutboxEntry[],
	): Promise<void> {
		await this.upsertDistributionWithOptLock(ctx, dist);
		await this.upsertChannels(ctx, dist);
		if (events.length) await this.insertEvents(ctx, events);
		if (outbox.length) await this.insertOutbox(ctx, dist.id, outbox);
	}

	// ─────────────────────────────────────────────────────────────────

	private async upsertDistributionWithOptLock(
		ctx: TxContext,
		dist: Distribution,
	): Promise<void> {
		const expectedVersion = dist.version;

		// INSERT khi version=0 (aggregate mới create), UPDATE ngược lại
		if (expectedVersion === 0) {
			// createQueryBuilder tránh DeepPartial strict cho jsonb channel_specs
			await ctx.manager
				.createQueryBuilder()
				.insert()
				.into(DistributionOrmEntity)
				.values({
					id: dist.id,
					releaseId: dist.releaseId,
					snapshotId: dist.snapshotId,
					tenantId: dist.tenantId,
					type: dist.type,
					correlationId: dist.correlationId,
					state: dist.state,
					upc: dist.upc ?? null,
					packageUri: dist.packageUri ?? null,
					retryCount: dist.retryCount,
					version: 1, // sau khi commit lần đầu, DB version=1
					channelSpecs: [...dist.channelSpecs] as unknown as object,
				})
				.execute();
			return;
		}

		// UPDATE với optlock: WHERE version=? then version+1
		const result = await ctx.manager
			.createQueryBuilder()
			.update(DistributionOrmEntity)
			.set({
				state: dist.state,
				upc: dist.upc ?? null,
				packageUri: dist.packageUri ?? null,
				retryCount: dist.retryCount,
				version: () => '"version" + 1',
			})
			.where('id = :id AND version = :version', {
				id: dist.id,
				version: expectedVersion,
			})
			.execute();

		if (result.affected === 0) {
			throw new OptimisticLockError(dist.id, expectedVersion);
		}
	}

	private async upsertChannels(
		ctx: TxContext,
		dist: Distribution,
	): Promise<void> {
		if (dist.channels.length === 0) return;

		// Chuyển spawnOrder từ channelId "distId:ch:N" → N
		const rows = dist.channels.map((c) => ({
			channelId: c.channelId,
			distributionId: dist.id,
			spawnOrder: parseSpawnOrder(c.channelId),
			dspCode: c.spec.dspCode,
			topology: c.spec.topology,
			processCode: c.spec.processCode,
			aggregatorCode: c.spec.aggregatorCode ?? null,
			exportMethod: c.spec.exportMethod ?? null,
			hasDeal: c.spec.hasDeal ?? null,
			pos: c.pos,
			state: c.state,
			retryCount: c.retryCount,
			ticketRef: c.ticketRef ?? null,
			// scheduledAt sẽ được handler set khi channel vào WAITING; giữ hiện trạng khi save
			scheduledAt: null,
		}));

		// UPSERT: conflict PK channel_id → UPDATE các cột state/pos/retry_count/ticket_ref
		await ctx.manager
			.createQueryBuilder()
			.insert()
			.into(ChannelDeliveryOrmEntity)
			.values(rows)
			.orUpdate(
				['pos', 'state', 'retry_count', 'ticket_ref', 'updated_at'],
				['channel_id'],
			)
			.execute();
	}

	private async insertEvents(
		ctx: TxContext,
		events: DomainEvent[],
	): Promise<void> {
		const rows = events.map((e) => ({
			distributionId: e.distributionId,
			channelId: e.channelId ?? null,
			type: e.type,
			level: e.payload.level,
			payload: { ...e.payload },
			occurredAt: e.occurredAt,
		}));
		// createQueryBuilder tránh TypeORM DeepPartial strict với jsonb Record<string, unknown>
		await ctx.manager
			.createQueryBuilder()
			.insert()
			.into(DistributionEventOrmEntity)
			.values(rows)
			.execute();
	}

	private async insertOutbox(
		ctx: TxContext,
		distributionId: string,
		outbox: OutboxEntry[],
	): Promise<void> {
		const rows = outbox.map((o) => ({
			distributionId,
			queue: o.queue,
			payload: { ...o.payload },
			jobId: o.jobId,
			delayMs: o.delayMs ?? 0,
			runAt: o.runAt ?? null,
		}));
		await ctx.manager
			.createQueryBuilder()
			.insert()
			.into(OutboxEventOrmEntity)
			.values(rows)
			.execute();
	}
}

// ─── row → domain mappers ─────────────────────────────────────────────

function toDistRow(r: DistributionOrmEntity): DistributionSnapshotRow {
	return {
		id: r.id,
		releaseId: r.releaseId,
		snapshotId: r.snapshotId,
		tenantId: r.tenantId,
		type: r.type as ExecutionTypeEnum,
		correlationId: r.correlationId,
		state: r.state as DistributionState,
		upc: r.upc ?? undefined,
		packageUri: r.packageUri ?? undefined,
		retryCount: r.retryCount,
		version: r.version,
		channelSpecs: (r.channelSpecs as ChannelDeliverySpec[]) ?? [],
	};
}

function toChannelRow(r: ChannelDeliveryOrmEntity): ChannelDeliveryRow {
	return {
		channelId: r.channelId,
		pos: r.pos,
		state: r.state as ChannelState,
		retryCount: r.retryCount,
		ticketRef: r.ticketRef ?? undefined,
	};
}

function toSpec(r: ChannelDeliveryOrmEntity): ChannelDeliverySpec {
	return {
		dspCode: r.dspCode,
		topology: r.topology as ChannelTopology,
		processCode: r.processCode,
		aggregatorCode: r.aggregatorCode ?? undefined,
		exportMethod: (r.exportMethod as ExportMethod | null) ?? undefined,
		hasDeal: r.hasDeal ?? undefined,
	};
}

/** Extract N from "distId:ch:N" — deterministic order for load(). */
function parseSpawnOrder(channelId: string): number {
	const parts = channelId.split(':');
	const n = Number(parts[parts.length - 1]);
	return Number.isFinite(n) ? n : 0;
}
