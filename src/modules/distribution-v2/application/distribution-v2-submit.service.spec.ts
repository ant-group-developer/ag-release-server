/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import {
	DistributionV2ChannelRoute,
	DistributionV2ExecutionType,
	DistributionV2Status,
} from '../domain';
import { ChannelDeliveryV2 } from '../entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from '../entities/distribution-event-v2.entity';
import { DistributionV2 } from '../entities/distribution-v2.entity';
import { OutboxEventV2 } from '../entities/outbox-event-v2.entity';
import { ReleaseSnapshotV2 } from '../entities/release-snapshot-v2.entity';
import { SubmitIdempotencyV2 } from '../entities/submit-idempotency-v2.entity';
import { DistributionV2SubmitService } from './distribution-v2-submit.service';
import {
	DistributionV2ReleaseReadModel,
	DistributionV2ReleaseReadPort,
} from './distribution-v2-submit.types';

describe('DistributionV2SubmitService', () => {
	let store: FakeStore;
	let manager: FakeManager;
	let service: DistributionV2SubmitService;
	let releasePort: jest.Mocked<DistributionV2ReleaseReadPort>;
	let release: DistributionV2ReleaseReadModel;

	const actor = {
		userId: 'user-1',
		tenantId: 'tenant-1',
	};

	beforeEach(() => {
		store = new FakeStore();
		manager = new FakeManager(store);
		release = makeRelease();
		releasePort = {
			read: jest.fn().mockResolvedValue(release),
		};
		service = new DistributionV2SubmitService(
			{
				transaction: async <T>(
					callback: (tx: EntityManager) => Promise<T>,
				) => callback(manager as unknown as EntityManager),
			} as any,
			releasePort,
			{ isEnabled: () => true } as any,
		);
	});

	it('creates an immutable snapshot and returns the same result for a duplicate key', async () => {
		const first = await service.submit(
			release.id,
			{ dspCodes: ['SPOTIFY'], needCiImport: false },
			actor,
			'request-1',
		);

		(release as { title: string }).title = 'Edited after submit';
		const second = await service.submit(
			release.id,
			{ dspCodes: ['SPOTIFY'], needCiImport: false },
			actor,
			'request-1',
		);

		expect(second).toEqual({ ...first, idempotent: true });
		expect(releasePort.read).toHaveBeenCalledTimes(1);
		expect(store.snapshots).toHaveLength(1);
		expect(store.snapshots[0].payload.release).toMatchObject({
			title: 'Original title',
		});
		expect(store.snapshots[0].payload.release).toMatchObject({
			tenantPolicy: { requiresManualReview: false },
		});
		expect(store.distributions).toHaveLength(1);
		expect(store.events).toHaveLength(1);
		expect(store.outbox).toHaveLength(1);
		expect(store.outbox[0].queueName).toBe('orchestrate');
	});

	it('rejects reuse of an idempotency key with a different request', async () => {
		await service.submit(
			release.id,
			{ dspCodes: ['SPOTIFY'] },
			actor,
			'request-1',
		);

		await expect(
			service.submit(
				release.id,
				{ dspCodes: ['ANGHAMI'] },
				actor,
				'request-1',
			),
		).rejects.toBeInstanceOf(ConflictException);
		expect(store.distributions).toHaveLength(1);
	});

	it('returns conflict when the release has an active v2 distribution for a selected DSP', async () => {
		store.activeDistributionRows = [{ id: randomUUID() }];

		await expect(
			service.submit(
				release.id,
				{ dspCodes: ['SPOTIFY'] },
				actor,
				'request-active',
			),
		).rejects.toThrow('đang có distribution-v2 hoạt động');
		expect(store.distributions).toHaveLength(0);
	});

	it('creates UPDATE without provisioning and TAKEDOWN only for a live DSP', async () => {
		const updated = await service.update(
			release.id,
			{ dspCodes: ['SPOTIFY'] },
			actor,
			'request-update',
		);
		expect(updated.type).toBe(DistributionV2ExecutionType.UPDATE);
		expect(store.snapshots[0].payload).toMatchObject({
			type: DistributionV2ExecutionType.UPDATE,
		});

		(
			release.dspDeliveries[0] as {
				hasLiveVersion: boolean;
			}
		).hasLiveVersion = true;
		const takedown = await service.takedown(
			release.id,
			{ dspCodes: ['SPOTIFY'] },
			actor,
			'request-takedown',
		);
		expect(takedown.type).toBe(DistributionV2ExecutionType.TAKEDOWN);
		expect(store.snapshots[1].payload).toMatchObject({
			type: DistributionV2ExecutionType.TAKEDOWN,
		});
	});

	it('uses the domain state machine for review approve and reject', async () => {
		const created = await service.submit(
			release.id,
			{ dspCodes: ['SPOTIFY'] },
			actor,
			'request-review',
		);
		const row = store.distributions[0];
		row.status = DistributionV2Status.WAITING_REVIEW;

		const approved = await service.approveReview(
			created.distributionId,
			actor,
			'review-approve-1',
		);
		expect(approved.status).toBe(DistributionV2Status.PROVISIONING_IDS);
		expect(store.events[store.events.length - 1]?.eventType).toBe(
			'distribution.review_approved',
		);
		expect(store.outbox[store.outbox.length - 1]?.queueName).toBe(
			'provision-id',
		);

		(release as { id: string }).id = 'release-2';
		const second = await service.submit(
			release.id,
			{ dspCodes: ['SPOTIFY'] },
			actor,
			'request-review-2',
		);
		store.distributions.find(
			(item) => item.id === second.distributionId,
		)!.status = DistributionV2Status.WAITING_REVIEW;
		const rejected = await service.rejectReview(
			second.distributionId,
			actor,
			'review-reject-1',
			'Thiếu thông tin bản quyền',
		);
		expect(rejected.status).toBe(DistributionV2Status.ACTION_REQUIRED);
		expect(store.events[store.events.length - 1]?.eventType).toBe(
			'distribution.review_rejected',
		);
	});
});

function makeRelease(): DistributionV2ReleaseReadModel {
	return {
		id: 'release-1',
		tenantId: 'tenant-1',
		type: 'audio',
		title: 'Original title',
		version: null,
		upc: null,
		status: 'draft',
		updatedAt: new Date('2026-09-17T00:00:00.000Z'),
		fields: { catalogId: 'catalog-1' },
		tracks: [
			{
				id: 'track-1',
				order: 1,
				title: 'Track 1',
				isrc: null,
				fields: { lyric: null },
				audio: {
					fileId: 'file-audio-1',
					key: 'audio/track-1.wav',
				},
			},
		],
		coverArts: [
			{
				fileId: 'file-cover-1',
				key: 'cover/release.jpg',
			},
		],
		video: null,
		dspDeliveries: [
			{
				id: 'delivery-1',
				dspId: 'dsp-1',
				dspCode: 'SPOTIFY',
				dspActive: true,
				isSelected: true,
				status: null,
				hasLiveVersion: false,
				route: DistributionV2ChannelRoute.DIRECT,
				aggregatorCode: null,
			},
			{
				id: 'delivery-2',
				dspId: 'dsp-2',
				dspCode: 'ANGHAMI',
				dspActive: true,
				isSelected: true,
				status: null,
				hasLiveVersion: false,
				route: DistributionV2ChannelRoute.DIRECT,
				aggregatorCode: null,
			},
		],
	};
}

class FakeStore {
	snapshots: ReleaseSnapshotV2[] = [];
	distributions: DistributionV2[] = [];
	channels: ChannelDeliveryV2[] = [];
	events: DistributionEventV2[] = [];
	outbox: OutboxEventV2[] = [];
	idempotencies: SubmitIdempotencyV2[] = [];
	activeDistributionRows: Array<{ id: string }> = [];
}

class FakeManager {
	constructor(private readonly store: FakeStore) {}

	getRepository(entity: unknown): any {
		if (entity === ReleaseSnapshotV2)
			return new FakeRepository(this.store.snapshots);
		if (entity === DistributionV2) {
			return new FakeRepository(this.store.distributions, {
				activeRows: this.store.activeDistributionRows,
			});
		}
		if (entity === ChannelDeliveryV2) {
			return new FakeRepository(this.store.channels, {
				distributionId: true,
			});
		}
		if (entity === DistributionEventV2)
			return new FakeRepository(this.store.events);
		if (entity === OutboxEventV2)
			return new FakeRepository(this.store.outbox);
		if (entity === SubmitIdempotencyV2) {
			return new FakeRepository(this.store.idempotencies);
		}
		throw new Error('Unexpected repository');
	}
}

class FakeRepository<T extends { id?: string }> {
	constructor(
		private readonly rows: T[],
		private readonly options: {
			activeRows?: Array<{ id: string }>;
			distributionId?: boolean;
		} = {},
	) {}

	create(value: Partial<T>): T {
		return value as T;
	}

	async save(value: T | T[]): Promise<T | T[]> {
		const values = Array.isArray(value) ? value : [value];
		for (const item of values) {
			if (!item.id) item.id = randomUUID();
			const index = this.rows.findIndex((row) => row.id === item.id);
			if (index >= 0) this.rows[index] = item;
			else this.rows.push(item);
		}
		return Array.isArray(value) ? values : values[0];
	}

	async findOne(options: {
		where: Record<string, unknown>;
	}): Promise<T | null> {
		const where = options.where;
		return (
			this.rows.find((row) =>
				Object.entries(where).every(
					([key, expected]) =>
						(row as Record<string, unknown>)[key] === expected,
				),
			) ?? null
		);
	}

	async find(options: {
		where: Record<string, unknown>;
		order?: Record<string, 'ASC' | 'DESC'>;
	}): Promise<T[]> {
		return this.rows.filter((row) =>
			Object.entries(options.where).every(
				([key, expected]) =>
					(row as Record<string, unknown>)[key] === expected,
			),
		);
	}

	createQueryBuilder() {
		return new FakeQueryBuilder(this.rows, this.options);
	}
}

class FakeQueryBuilder<T extends { id?: string }> {
	private valuesToInsert: Partial<T> | null = null;
	private whereParams: Record<string, unknown> = {};

	constructor(
		private readonly rows: T[],
		private readonly options: {
			activeRows?: Array<{ id: string }>;
			distributionId?: boolean;
		},
	) {}

	insert() {
		return this;
	}

	into() {
		return this;
	}

	values(values: Partial<T>) {
		this.valuesToInsert = values;
		return this;
	}

	orIgnore() {
		return this;
	}

	async execute() {
		if (
			this.valuesToInsert &&
			!this.rows.some((row) =>
				Object.entries(this.valuesToInsert!).every(
					([key, value]) =>
						(row as Record<string, unknown>)[key] === value,
				),
			)
		) {
			this.rows.push(this.valuesToInsert as T);
		}
		return { identifiers: [] };
	}

	leftJoin() {
		return this;
	}

	where(_condition: string, params?: Record<string, unknown>) {
		this.whereParams = { ...this.whereParams, ...params };
		return this;
	}

	andWhere(_condition: string, params?: Record<string, unknown>) {
		this.whereParams = { ...this.whereParams, ...params };
		return this;
	}

	select() {
		return this;
	}

	async getRawMany() {
		return this.options.activeRows ?? [];
	}
}
