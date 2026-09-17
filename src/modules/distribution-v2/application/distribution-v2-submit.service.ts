import {
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DistributionV2ConfigService } from '../config/distribution-v2.config.service';
import {
	DistributionV2ChannelStatus,
	DistributionV2ExecutionType,
	DistributionV2Status,
} from '../domain';
import { Distribution } from '../domain/distribution/distribution';
import { DistributionState } from '../domain/distribution/distribution.types';
import { ChannelDeliveryV2 } from '../entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from '../entities/distribution-event-v2.entity';
import { DistributionV2 } from '../entities/distribution-v2.entity';
import { OutboxEventV2 } from '../entities/outbox-event-v2.entity';
import { ReleaseSnapshotV2 } from '../entities/release-snapshot-v2.entity';
import { SubmitIdempotencyV2 } from '../entities/submit-idempotency-v2.entity';
import {
	DISTRIBUTION_V2_RELEASE_READ_PORT,
	DistributionV2Actor,
	DistributionV2ReleaseReadModel,
	DistributionV2ReleaseReadPort,
	DistributionV2ReviewResult,
	DistributionV2SubmitInput,
	DistributionV2SubmitResult,
} from './distribution-v2-submit.types';

const TERMINAL_DISTRIBUTION_STATUSES = new Set<DistributionV2Status>([
	DistributionV2Status.DISTRIBUTED,
	DistributionV2Status.PARTIALLY_DISTRIBUTED,
	DistributionV2Status.FAILED,
	DistributionV2Status.TAKEN_DOWN,
]);

const MAX_IDEMPOTENCY_KEY_LENGTH = 180;

@Injectable()
export class DistributionV2SubmitService {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,
		@Inject(DISTRIBUTION_V2_RELEASE_READ_PORT)
		private readonly releaseReadPort: DistributionV2ReleaseReadPort,
		private readonly config: DistributionV2ConfigService,
	) {}

	async submit(
		releaseId: string,
		input: DistributionV2SubmitInput,
		actor: DistributionV2Actor,
		idempotencyKey: string,
	): Promise<DistributionV2SubmitResult> {
		return this.createDistribution(
			DistributionV2ExecutionType.INITIAL,
			releaseId,
			input,
			actor,
			idempotencyKey,
		);
	}

	async update(
		releaseId: string,
		input: DistributionV2SubmitInput,
		actor: DistributionV2Actor,
		idempotencyKey: string,
	): Promise<DistributionV2SubmitResult> {
		return this.createDistribution(
			DistributionV2ExecutionType.UPDATE,
			releaseId,
			input,
			actor,
			idempotencyKey,
		);
	}

	async takedown(
		releaseId: string,
		input: DistributionV2SubmitInput,
		actor: DistributionV2Actor,
		idempotencyKey: string,
	): Promise<DistributionV2SubmitResult> {
		return this.createDistribution(
			DistributionV2ExecutionType.TAKEDOWN,
			releaseId,
			input,
			actor,
			idempotencyKey,
		);
	}

	async approveReview(
		distributionId: string,
		actor: DistributionV2Actor,
		idempotencyKey: string,
	): Promise<DistributionV2ReviewResult> {
		return this.applyReview(
			distributionId,
			actor,
			idempotencyKey,
			'REVIEW_APPROVED',
		);
	}

	async rejectReview(
		distributionId: string,
		actor: DistributionV2Actor,
		idempotencyKey: string,
		reason: string,
	): Promise<DistributionV2ReviewResult> {
		const note = reason?.trim();
		if (!note) {
			throw new ConflictException('Review reject bắt buộc có lý do');
		}
		return this.applyReview(
			distributionId,
			actor,
			idempotencyKey,
			'REVIEW_REJECTED',
			note,
		);
	}

	private async applyReview(
		distributionId: string,
		actor: DistributionV2Actor,
		idempotencyKey: string,
		type: 'REVIEW_APPROVED' | 'REVIEW_REJECTED',
		reason?: string,
	): Promise<DistributionV2ReviewResult> {
		this.assertEnabled();
		const key = this.normalizeIdempotencyKey(idempotencyKey);
		const commandId = `${distributionId}:review:${key}`;
		const now = new Date();

		return this.dataSource.transaction(async (manager) => {
			const distributionRepo = manager.getRepository(DistributionV2);
			const distribution = await distributionRepo.findOne({
				where: { id: distributionId },
			});
			if (!distribution) {
				throw new NotFoundException('Không tìm thấy distribution-v2');
			}
			if (
				!actor.isSystemAdmin &&
				distribution.tenantId !== actor.tenantId
			) {
				throw new ForbiddenException(
					'Không có quyền review distribution-v2 này',
				);
			}
			if (distribution.lastCommandId === commandId) {
				return {
					distributionId,
					status: distribution.status,
					commandId,
					idempotent: true,
				};
			}

			const persistedChannels = await manager
				.getRepository(ChannelDeliveryV2)
				.find({
					where: { distributionId },
					order: { createdAt: 'ASC' },
				});
			const aggregate = Distribution.rehydrate(
				toDomainState(distribution, persistedChannels),
			);
			const command: DistributionCommandForReview =
				type === 'REVIEW_APPROVED'
					? {
							type,
							commandId,
							occurredAt: now.toISOString(),
							reviewerId: actor.userId,
						}
					: {
							type,
							commandId,
							occurredAt: now.toISOString(),
							reviewerId: actor.userId,
							reason: reason!,
						};
			const events = aggregate.apply(command);
			const next = aggregate.state;

			distribution.status = next.status;
			distribution.version = next.version;
			distribution.lastCommandId = commandId;
			await distributionRepo.save(distribution);

			for (const channel of next.channels) {
				const row = persistedChannels.find(
					(item) => item.id === channel.id,
				);
				if (!row) continue;
				Object.assign(row, {
					status: channel.status,
					currentStage: channel.currentStage ?? null,
					retryCount: channel.retryCount,
					waitReason: channel.waitReason ?? null,
					scheduledAt: channel.scheduledAt
						? new Date(channel.scheduledAt)
						: null,
					lastError: channel.lastError ?? null,
					externalRefs: channel.externalRefs ?? {},
					lastCommandId: channel.lastCommandId ?? null,
				});
			}
			if (persistedChannels.length > 0) {
				await manager
					.getRepository(ChannelDeliveryV2)
					.save(persistedChannels);
			}

			const eventRepo = manager.getRepository(DistributionEventV2);
			for (const domainEvent of events) {
				await eventRepo.save(
					eventRepo.create({
						distributionId,
						channelId: domainEvent.channelId ?? null,
						stepId: null,
						eventType: domainEvent.type,
						level: 'milestone',
						payload: domainEvent.payload,
						correlationId: distribution.correlationId,
						occurredAt: new Date(domainEvent.occurredAt),
					}),
				);
			}

			const queue = queueForReviewStatus(next.status);
			if (queue) {
				const outboxRepo = manager.getRepository(OutboxEventV2);
				await outboxRepo.save(
					outboxRepo.create({
						distributionId,
						queueName: queue,
						payload: {
							distributionId,
							correlationId: distribution.correlationId,
							snapshotId: distribution.snapshotId,
							command: next.status,
							commandId,
							occurredAt: now.toISOString(),
						},
						jobId: `${distributionId}:review:${commandId}`,
						availableAt: now,
						leaseUntil: null,
						attempts: 0,
						lastError: null,
						lastAttemptedAt: null,
						dispatchedAt: null,
					}),
				);
			}

			return {
				distributionId,
				status: next.status,
				commandId,
				idempotent: false,
			};
		});
	}

	private async createDistribution(
		type: DistributionV2ExecutionType,
		releaseId: string,
		input: DistributionV2SubmitInput,
		actor: DistributionV2Actor,
		idempotencyKey: string,
	): Promise<DistributionV2SubmitResult> {
		this.assertEnabled();
		const normalizedKey = this.normalizeIdempotencyKey(idempotencyKey);
		const normalizedInput = this.normalizeInput(input);
		const requestHash = hashJson({
			releaseId,
			type,
			input: normalizedInput,
		});
		const operation = type;

		return this.dataSource.transaction(async (manager) => {
			const idempotency = manager.getRepository(SubmitIdempotencyV2);
			await idempotency
				.createQueryBuilder()
				.insert()
				.into(SubmitIdempotencyV2)
				.values({
					tenantId: actor.tenantId,
					releaseId,
					operation,
					idempotencyKey: normalizedKey,
					requestHash,
					distributionId: null,
					correlationId: null,
					responsePayload: null,
				})
				.orIgnore()
				.execute();

			const existing = await idempotency.findOne({
				where: {
					tenantId: actor.tenantId,
					operation,
					idempotencyKey: normalizedKey,
				},
			});
			if (!existing) {
				throw new ConflictException(
					'Không thể tạo bản ghi idempotency cho request',
				);
			}
			if (existing.requestHash !== requestHash) {
				throw new ConflictException(
					'Idempotency-Key đã được dùng cho request khác',
				);
			}
			if (existing.responsePayload) {
				return {
					...(existing.responsePayload as unknown as DistributionV2SubmitResult),
					idempotent: true,
				};
			}

			const release = await this.releaseReadPort.read(releaseId, manager);
			if (!release) {
				throw new NotFoundException('Không tìm thấy bản phát hành');
			}
			if (release.id !== releaseId) {
				throw new ConflictException(
					'ReleaseReadPort trả về release không khớp request',
				);
			}
			this.assertTenantAccess(release, actor);
			this.assertReleaseCanSubmit(release, type);
			this.assertDspSelection(release, normalizedInput.dspCodes);
			if (type === DistributionV2ExecutionType.TAKEDOWN) {
				this.assertCanTakedown(release, normalizedInput.dspCodes);
			}
			await this.assertNoActiveDistribution(
				manager,
				release,
				normalizedInput.dspCodes,
			);

			const now = new Date();
			const snapshotId = randomUUID();
			const distributionId = randomUUID();
			const correlationId = randomUUID();
			const channels = this.buildChannels(
				release,
				normalizedInput.dspCodes,
				distributionId,
				type,
			);
			const snapshotPayload = buildSnapshotPayload(
				release,
				normalizedInput,
				type,
			);
			const snapshot = manager.getRepository(ReleaseSnapshotV2).create({
				id: snapshotId,
				releaseId,
				sourceUpdatedAt: release.updatedAt,
				payload: snapshotPayload,
				assetManifest: buildAssetManifest(release),
				selectedDspCodes: [...normalizedInput.dspCodes],
				contentHash: hashJson(snapshotPayload),
				trackOrderHash: hashJson(
					release.tracks.map((track) => ({
						id: track.id,
						order: track.order,
					})),
				),
			});
			await manager.getRepository(ReleaseSnapshotV2).save(snapshot);

			const distribution = manager.getRepository(DistributionV2).create({
				id: distributionId,
				releaseId,
				tenantId: release.tenantId,
				type,
				status: DistributionV2Status.SUBMITTED,
				snapshotId,
				correlationId,
				createdBy: actor.userId,
				version: 0,
				resubmittedFromId: null,
				lastCommandId: null,
			});
			await manager.getRepository(DistributionV2).save(distribution);

			await manager
				.getRepository(ChannelDeliveryV2)
				.save(
					channels.map((channel) =>
						manager
							.getRepository(ChannelDeliveryV2)
							.create(channel),
					),
				);

			const eventPayload = {
				type,
				releaseId,
				snapshotId,
				dspCodes: normalizedInput.dspCodes,
				needCiImport: normalizedInput.needCiImport,
				sourceUpdatedAt: release.updatedAt.toISOString(),
				contentHash: snapshot.contentHash,
			};
			await manager.getRepository(DistributionEventV2).save(
				manager.getRepository(DistributionEventV2).create({
					distributionId,
					channelId: null,
					stepId: null,
					eventType: 'distribution.submitted',
					level: 'milestone',
					payload: eventPayload,
					correlationId,
					occurredAt: now,
				}),
			);

			const commandId = `${distributionId}:submit`;
			await manager.getRepository(OutboxEventV2).save(
				manager.getRepository(OutboxEventV2).create({
					distributionId,
					queueName: 'orchestrate',
					payload: {
						distributionId,
						correlationId,
						snapshotId,
						type,
						command: 'START_VALIDATION',
						commandId,
						occurredAt: now.toISOString(),
					},
					jobId: `${distributionId}:orchestrate:submit`,
					availableAt: now,
					leaseUntil: null,
					attempts: 0,
					lastError: null,
					lastAttemptedAt: null,
					dispatchedAt: null,
				}),
			);

			const result: DistributionV2SubmitResult = {
				distributionId,
				correlationId,
				snapshotId,
				type,
				status: DistributionV2Status.SUBMITTED,
				idempotent: false,
			};
			existing.distributionId = distributionId;
			existing.correlationId = correlationId;
			existing.responsePayload = result as unknown as Record<
				string,
				unknown
			>;
			await idempotency.save(existing);
			return result;
		});
	}

	private assertEnabled(): void {
		if (!this.config.isEnabled()) {
			throw new NotFoundException('Distribution v2 chưa được bật');
		}
	}

	private normalizeIdempotencyKey(value: string): string {
		const key = value?.trim();
		if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
			throw new ConflictException(
				'Idempotency-Key bắt buộc và không vượt quá 180 ký tự',
			);
		}
		return key;
	}

	private normalizeInput(
		input: DistributionV2SubmitInput,
	): DistributionV2SubmitInput {
		const dspCodes = [
			...new Set(
				(input?.dspCodes ?? [])
					.map((code) => String(code).trim())
					.filter(Boolean),
			),
		];
		if (dspCodes.length === 0) {
			throw new ConflictException('Phải chọn ít nhất một DSP');
		}
		return {
			dspCodes,
			needCiImport: input?.needCiImport === true,
		};
	}

	private assertTenantAccess(
		release: DistributionV2ReleaseReadModel,
		actor: DistributionV2Actor,
	): void {
		if (!actor.isSystemAdmin && release.tenantId !== actor.tenantId) {
			throw new ForbiddenException(
				'Không có quyền truy cập tenant của release',
			);
		}
	}

	private assertReleaseCanSubmit(
		release: DistributionV2ReleaseReadModel,
		type: DistributionV2ExecutionType,
	): void {
		if (type === DistributionV2ExecutionType.TAKEDOWN) return;
		if (!release.title?.trim()) {
			throw new ConflictException('Release thiếu title');
		}
		if (release.tracks.length === 0) {
			throw new ConflictException('Release phải có ít nhất một track');
		}
		if (release.tracks.some((track) => !track.title?.trim())) {
			throw new ConflictException('Track thiếu title');
		}
	}

	private assertCanTakedown(
		release: DistributionV2ReleaseReadModel,
		dspCodes: readonly string[],
	): void {
		const deliveries = new Map(
			release.dspDeliveries.map((delivery) => [
				delivery.dspCode.toLowerCase(),
				delivery,
			]),
		);
		const notLive = dspCodes.filter((code) => {
			const delivery = deliveries.get(code.toLowerCase());
			return (
				!delivery?.hasLiveVersion &&
				delivery?.status?.toLowerCase() !== 'distributed'
			);
		});
		if (notLive.length > 0) {
			throw new ConflictException(
				`Không thể takedown DSP chưa LIVE: ${notLive.join(', ')}`,
			);
		}
	}

	private assertDspSelection(
		release: DistributionV2ReleaseReadModel,
		dspCodes: readonly string[],
	): void {
		const deliveries = new Map(
			release.dspDeliveries.map((delivery) => [
				delivery.dspCode.toLowerCase(),
				delivery,
			]),
		);
		const invalid = dspCodes.filter((code) => {
			const delivery = deliveries.get(code.toLowerCase());
			return !delivery || !delivery.isSelected || !delivery.dspActive;
		});
		if (invalid.length > 0) {
			throw new ConflictException(
				`DSP không hợp lệ hoặc chưa được chọn: ${invalid.join(', ')}`,
			);
		}
	}

	private async assertNoActiveDistribution(
		manager: EntityManager,
		release: DistributionV2ReleaseReadModel,
		dspCodes: readonly string[],
	): Promise<void> {
		const rows = await manager
			.getRepository(DistributionV2)
			.createQueryBuilder('distribution')
			.leftJoin(
				ChannelDeliveryV2,
				'channel',
				'channel.distribution_id = distribution.id',
			)
			.where('distribution.release_id = :releaseId', {
				releaseId: release.id,
			})
			.andWhere('distribution.tenant_id = :tenantId', {
				tenantId: release.tenantId,
			})
			.andWhere('distribution.status NOT IN (:...terminal)', {
				terminal: [...TERMINAL_DISTRIBUTION_STATUSES],
			})
			.andWhere('LOWER(channel.dsp_code) IN (:...dspCodes)', {
				dspCodes: dspCodes.map((code) => code.toLowerCase()),
			})
			.select('distribution.id', 'id')
			.getRawMany<{ id: string }>();
		if (rows.length > 0) {
			throw new ConflictException(
				`Release đang có distribution-v2 hoạt động cho DSP: ${dspCodes.join(', ')}`,
			);
		}
	}

	private buildChannels(
		release: DistributionV2ReleaseReadModel,
		dspCodes: readonly string[],
		distributionId: string,
		type: DistributionV2ExecutionType,
	): Array<Partial<ChannelDeliveryV2>> {
		const selected = new Map(
			release.dspDeliveries.map((delivery) => [
				delivery.dspCode.toLowerCase(),
				delivery,
			]),
		);
		return dspCodes.map((code) => {
			const delivery = selected.get(code.toLowerCase())!;
			return {
				id: randomUUID(),
				distributionId,
				dspId: delivery.dspId,
				dspCode: delivery.dspCode,
				route: delivery.route,
				aggregatorCode: delivery.aggregatorCode ?? null,
				status: DistributionV2ChannelStatus.PENDING,
				currentStage:
					type === DistributionV2ExecutionType.TAKEDOWN
						? 'takedown'
						: null,
				retryCount: 0,
				previousLive:
					delivery.hasLiveVersion ||
					delivery.status?.toLowerCase() === 'distributed',
				waitReason: null,
				scheduledAt: null,
				lastError: null,
				externalRefs: {},
				lastCommandId: null,
			};
		});
	}
}

type DistributionCommandForReview =
	| {
			readonly type: 'REVIEW_APPROVED';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly reviewerId: string;
	  }
	| {
			readonly type: 'REVIEW_REJECTED';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly reviewerId: string;
			readonly reason: string;
	  };

function toDomainState(
	distribution: DistributionV2,
	channels: readonly ChannelDeliveryV2[],
): DistributionState {
	return {
		id: distribution.id,
		releaseId: distribution.releaseId,
		tenantId: distribution.tenantId,
		snapshotId: distribution.snapshotId,
		correlationId: distribution.correlationId,
		type: distribution.type,
		status: distribution.status,
		version: distribution.version,
		lastCommandId: distribution.lastCommandId ?? undefined,
		channels: channels.map((channel) => ({
			id: channel.id,
			dspCode: channel.dspCode,
			route: channel.route,
			aggregatorCode: channel.aggregatorCode,
			status: channel.status,
			currentStage: channel.currentStage,
			retryCount: channel.retryCount,
			waitReason: channel.waitReason,
			scheduledAt: channel.scheduledAt?.toISOString() ?? null,
			lastError: channel.lastError,
			externalRefs: channel.externalRefs,
			previousLive: channel.previousLive,
			lastCommandId: channel.lastCommandId ?? undefined,
		})),
	};
}

function queueForReviewStatus(status: DistributionV2Status): string | null {
	switch (status) {
		case DistributionV2Status.PROVISIONING_IDS:
			return 'provision-id';
		case DistributionV2Status.BUILDING_PACKAGE:
			return 'build-package';
		case DistributionV2Status.DISTRIBUTING:
			return 'orchestrate';
		default:
			return null;
	}
}

function buildSnapshotPayload(
	release: DistributionV2ReleaseReadModel,
	input: DistributionV2SubmitInput,
	type: DistributionV2ExecutionType,
): Record<string, unknown> {
	return {
		schemaVersion: 1,
		type,
		release: {
			id: release.id,
			tenantId: release.tenantId,
			type: release.type,
			title: release.title,
			version: release.version,
			upc: release.upc,
			status: release.status,
			updatedAt: release.updatedAt.toISOString(),
			fields: release.fields,
			tenantPolicy: release.tenantPolicy ?? {
				requiresManualReview: false,
			},
			tracks: release.tracks
				.slice()
				.sort((a, b) => a.order - b.order)
				.map((track) => ({
					id: track.id,
					order: track.order,
					title: track.title,
					isrc: track.isrc,
					fields: track.fields,
					audio: track.audio ?? null,
				})),
			coverArts: release.coverArts,
			video: release.video ?? null,
		},
		distribution: {
			dspCodes: input.dspCodes,
			needCiImport: input.needCiImport === true,
		},
	};
}

function buildAssetManifest(
	release: DistributionV2ReleaseReadModel,
): Record<string, unknown> {
	return {
		coverArts: release.coverArts.map((asset) => ({ ...asset })),
		audio: release.tracks.map((track) => ({
			trackId: track.id,
			asset: track.audio ? { ...track.audio } : null,
		})),
		video: release.video ?? null,
	};
}

function hashJson(value: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(sortObject(value)))
		.digest('hex');
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortObject);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, sortObject(item)]),
		);
	}
	return value;
}
