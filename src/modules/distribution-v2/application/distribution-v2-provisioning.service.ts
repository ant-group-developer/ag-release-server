import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { DataSource, EntityManager } from 'typeorm';
import { Distribution, DistributionV2Status } from '../domain';
import { ChannelDeliveryV2 } from '../entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from '../entities/distribution-event-v2.entity';
import { DistributionV2 } from '../entities/distribution-v2.entity';
import { ExternalOperationV2 } from '../entities/external-operation-v2.entity';
import { IdentifierAssignmentV2 } from '../entities/identifier-assignment-v2.entity';
import { OutboxEventV2 } from '../entities/outbox-event-v2.entity';
import { ReleaseSnapshotV2 } from '../entities/release-snapshot-v2.entity';
import { DistributionV2ExternalOperationStatus } from '../enums/distribution-v2.enum';
import {
	DistributionV2ProvisionIdJobPayload,
	DistributionV2ProvisioningResult,
} from './distribution-v2-provisioning.types';
import {
	DISTRIBUTION_V2_IDENTIFIER_PROVISIONER,
	IdentifierProvisioner,
	ProvisionIsrcInput,
	ProvisionUpcInput,
	ProvisionedIdentifier,
} from './ports/identifier-provisioner.port';

type SnapshotRelease = {
	id: string;
	title?: string | null;
	upc?: string | null;
	fields?: Record<string, unknown>;
	tracks?: SnapshotTrack[];
	video?: SnapshotVideo | null;
};

type SnapshotTrack = {
	id: string;
	title?: string | null;
	isrc?: string | null;
	fields?: Record<string, unknown>;
	audio?: Record<string, unknown> | null;
};

type SnapshotVideo = {
	id: string;
	isrc?: string | null;
	fields?: Record<string, unknown>;
};

type SnapshotPayload = {
	release?: SnapshotRelease;
};

type ResolvedIdentifier = {
	value: string;
	generated: boolean;
	externalOperationId?: string | null;
};

/**
 * Application service for the `provision-id` queue.
 *
 * External calls intentionally happen outside the final DB transaction.  The
 * generator request and our external_operations/identifier_assignments rows
 * share a deterministic request id, so a crash at any boundary is safe to
 * replay.
 */
@Injectable()
export class DistributionV2ProvisioningService {
	private readonly logger = new Logger(
		DistributionV2ProvisioningService.name,
	);

	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,
		@Inject(DISTRIBUTION_V2_IDENTIFIER_PROVISIONER)
		private readonly provisioner: IdentifierProvisioner,
	) {}

	async handle(
		payload: DistributionV2ProvisionIdJobPayload,
	): Promise<DistributionV2ProvisioningResult> {
		const distribution = await this.dataSource
			.getRepository(DistributionV2)
			.findOne({ where: { id: payload.distributionId } });
		if (!distribution) {
			throw new Error(
				`distribution-v2 ${payload.distributionId} was not found`,
			);
		}

		// A redelivered job after the state transition is a successful no-op.
		if (distribution.status !== DistributionV2Status.PROVISIONING_IDS) {
			return {
				distributionId: distribution.id,
				status: distribution.status,
				identifiers: {},
				reusedCount: 0,
				provisionedCount: 0,
			};
		}

		const snapshot = await this.dataSource
			.getRepository(ReleaseSnapshotV2)
			.findOne({ where: { id: distribution.snapshotId } });
		if (!snapshot) {
			throw new Error(
				`snapshot ${distribution.snapshotId} was not found for distribution ${distribution.id}`,
			);
		}

		const release = readSnapshotRelease(snapshot.payload);
		if (!release) {
			throw new Error(`snapshot ${snapshot.id} has no release payload`);
		}
		if (release.id !== distribution.releaseId) {
			throw new Error(
				`snapshot ${snapshot.id} belongs to release ${release.id}, expected ${distribution.releaseId}`,
			);
		}

		const identifiers: Record<string, string> = {};
		let reusedCount = 0;
		let provisionedCount = 0;

		const releaseUpc = normalizeIdentifier(release.upc);
		if (releaseUpc) {
			identifiers[`release:${distribution.releaseId}:upc`] = releaseUpc;
		} else {
			const resolved = await this.resolveUpc(distribution, release);
			identifiers[`release:${distribution.releaseId}:upc`] =
				resolved.value;
			if (resolved.generated) provisionedCount++;
			else reusedCount++;
		}

		for (const track of release.tracks ?? []) {
			const current = normalizeIdentifier(track.isrc);
			if (current) {
				identifiers[`track:${track.id}:isrc`] = current;
				continue;
			}

			const resolved = await this.resolveIsrc(
				distribution,
				release,
				track,
				'AUDIO',
			);
			identifiers[`track:${track.id}:isrc`] = resolved.value;
			if (resolved.generated) provisionedCount++;
			else reusedCount++;
		}

		if (release.video) {
			const current = normalizeIdentifier(release.video.isrc);
			if (current) {
				identifiers[`video:${release.video.id}:isrc`] = current;
			} else {
				const resolved = await this.resolveIsrc(
					distribution,
					release,
					{
						id: release.video.id,
						title: release.title,
						isrc: null,
						fields: release.video.fields,
					},
					'VIDEO',
				);
				identifiers[`video:${release.video.id}:isrc`] = resolved.value;
				if (resolved.generated) provisionedCount++;
				else reusedCount++;
			}
		}

		await this.enqueueSourceSync(
			distribution,
			payload.commandId ??
				`${distribution.id}:provision-id:${distribution.snapshotId}`,
			payload.occurredAt ?? new Date().toISOString(),
		);

		this.logger.log(
			`Provisioned identifiers for distribution ${distribution.id}: ` +
				`${provisionedCount} new, ${reusedCount} replayed`,
		);

		return {
			distributionId: distribution.id,
			status: distribution.status,
			identifiers,
			reusedCount,
			provisionedCount,
		};
	}

	/**
	 * The source update is a separate queue step.  If PostgreSQL is temporarily
	 * unavailable after the generator call, only this step is retried; the
	 * external generator is reconciled from identifier_assignments.
	 */
	async syncSourceIdentifiers(
		payload: DistributionV2ProvisionIdJobPayload,
	): Promise<DistributionV2ProvisioningResult> {
		const distribution = await this.dataSource
			.getRepository(DistributionV2)
			.findOne({ where: { id: payload.distributionId } });
		if (!distribution) {
			throw new Error(
				`distribution-v2 ${payload.distributionId} was not found`,
			);
		}
		if (distribution.status !== DistributionV2Status.PROVISIONING_IDS) {
			return {
				distributionId: distribution.id,
				status: distribution.status,
				identifiers: {},
				reusedCount: 0,
				provisionedCount: 0,
			};
		}
		const snapshot = await this.dataSource
			.getRepository(ReleaseSnapshotV2)
			.findOne({ where: { id: distribution.snapshotId } });
		if (!snapshot)
			throw new Error(
				`snapshot ${distribution.snapshotId} was not found`,
			);
		const release = readSnapshotRelease(snapshot.payload);
		if (!release)
			throw new Error(`snapshot ${snapshot.id} has no release payload`);
		if (release.id !== distribution.releaseId) {
			throw new Error(
				`snapshot ${snapshot.id} belongs to release ${release.id}, expected ${distribution.releaseId}`,
			);
		}
		const assignments = await this.dataSource
			.getRepository(IdentifierAssignmentV2)
			.find({ where: { distributionId: distribution.id } });
		const identifiers: Record<string, string> = {};
		for (const value of [
			...(release.upc
				? [
						[
							`release:${distribution.releaseId}:upc`,
							release.upc,
						] as const,
					]
				: []),
			...(release.tracks ?? [])
				.filter((track) => track.isrc)
				.map(
					(track) => [`track:${track.id}:isrc`, track.isrc!] as const,
				),
			...(release.video?.isrc
				? [
						[
							`video:${release.video.id}:isrc`,
							release.video.isrc,
						] as const,
					]
				: []),
		]) {
			identifiers[value[0]] = value[1];
		}
		for (const assignment of assignments) {
			identifiers[
				assignment.source === 'release.upc'
					? `release:${distribution.releaseId}:upc`
					: assignment.source === 'video.isrc'
						? `video:${assignment.trackId}:isrc`
						: `track:${assignment.trackId}:isrc`
			] = assignment.value;
			if (assignment.source === 'release.upc') {
				await this.syncReleaseIdentifier(
					this.dataSource.manager,
					distribution.releaseId,
					assignment.value,
				);
			} else if (assignment.source === 'video.isrc') {
				if (!assignment.trackId)
					throw new Error('video assignment is missing trackId');
				await this.syncVideoIdentifier(
					this.dataSource.manager,
					assignment.trackId,
					assignment.value,
				);
			} else {
				if (!assignment.trackId)
					throw new Error('track assignment is missing trackId');
				await this.syncTrackIdentifier(
					this.dataSource.manager,
					assignment.trackId,
					assignment.value,
				);
			}
		}
		const completed = await this.completeProvisioning(
			distribution.id,
			identifiers,
			`${payload.commandId ?? `${distribution.id}:sync-source-id`}:complete`,
			payload.occurredAt ?? new Date().toISOString(),
		);
		return {
			distributionId: distribution.id,
			status: completed.status,
			identifiers,
			reusedCount: 0,
			provisionedCount: assignments.length,
		};
	}

	private async enqueueSourceSync(
		distribution: DistributionV2,
		commandId: string,
		occurredAt: string,
	): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			const current = await manager
				.getRepository(DistributionV2)
				.findOne({
					where: { id: distribution.id },
				});
			if (
				!current ||
				current.status !== DistributionV2Status.PROVISIONING_IDS
			) {
				return;
			}
			await manager
				.getRepository(OutboxEventV2)
				.createQueryBuilder()
				.insert()
				.values({
					distributionId: distribution.id,
					queueName: 'sync-source-id',
					payload: {
						distributionId: distribution.id,
						correlationId: distribution.correlationId,
						snapshotId: distribution.snapshotId,
						command: 'SYNC_SOURCE_IDENTIFIERS',
						commandId: `${commandId}:sync-source-id`,
						occurredAt,
					},
					jobId: `${distribution.id}:sync-source-id:${distribution.snapshotId}`,
					availableAt: new Date(),
					leaseUntil: null,
					attempts: 0,
					lastError: null,
					lastAttemptedAt: null,
					dispatchedAt: null,
				})
				.orIgnore()
				.execute();
		});
	}

	private async resolveUpc(
		distribution: DistributionV2,
		release: SnapshotRelease,
	): Promise<ResolvedIdentifier> {
		const requestId = [
			'distribution-v2',
			distribution.id,
			'release',
			distribution.releaseId,
			'upc',
		].join(':');
		const idempotencyKey = requestId;
		const assignment = await this.findAssignment('UPC', requestId);
		if (assignment) {
			return {
				value: assignment.value,
				generated: false,
				externalOperationId: assignment.externalOperationId,
			};
		}

		const input: ProvisionUpcInput = {
			requestId,
			consumer: 'distribution-v2',
			releaseId: distribution.releaseId,
			idempotencyKey,
			description: release.title ?? null,
		};
		const result = await this.runExternalOperation(
			distribution,
			'UPC',
			requestId,
			idempotencyKey,
			input,
			() => this.provisioner.provisionUpc(input),
		);
		await this.saveAssignment(
			distribution,
			'UPC',
			'release.upc',
			null,
			requestId,
			idempotencyKey,
			result,
		);
		return {
			value: result.value,
			generated: true,
			externalOperationId: result.externalOperationId,
		};
	}

	private async resolveIsrc(
		distribution: DistributionV2,
		release: SnapshotRelease,
		owner: SnapshotTrack,
		assetType: 'AUDIO' | 'VIDEO',
	): Promise<ResolvedIdentifier> {
		const requestId = [
			'distribution-v2',
			distribution.id,
			assetType.toLowerCase(),
			owner.id,
			'isrc',
		].join(':');
		const idempotencyKey = requestId;
		const assignment = await this.findAssignment('ISRC', requestId);
		if (assignment) {
			return {
				value: assignment.value,
				generated: false,
				externalOperationId: assignment.externalOperationId,
			};
		}

		const fields = owner.fields ?? {};
		const releaseFields = release.fields ?? {};
		const input: ProvisionIsrcInput = {
			requestId,
			consumer: 'distribution-v2',
			trackId: owner.id,
			idempotencyKey,
			registrantName: firstText(
				fields.registrantName,
				releaseFields.pLineOwner,
				'ANT GROUP',
			),
			recordingArtist: firstText(
				fields.recordingArtist,
				fields.artistName,
				releaseFields.artistName,
				'Various Artists',
			),
			recordingTitle: firstText(owner.title, release.title, owner.id),
			versionTitle: firstText(fields.version, ''),
			assetType,
			immersive: Boolean(fields.immersive),
			explicit: Boolean(fields.explicit),
			yearOfProduction: numberOr(
				fields.pLineYear,
				releaseFields.pLineYear,
				new Date().getUTCFullYear(),
			),
			duration: numberOr(owner.audio?.duration, fields.duration, 0),
			isAdded: false,
		};
		const result = await this.runExternalOperation(
			distribution,
			'ISRC',
			requestId,
			idempotencyKey,
			input,
			() => this.provisioner.provisionIsrc(input),
		);
		await this.saveAssignment(
			distribution,
			'ISRC',
			assetType === 'VIDEO' ? 'video.isrc' : 'track.isrc',
			owner.id,
			requestId,
			idempotencyKey,
			result,
		);
		return {
			value: result.value,
			generated: true,
			externalOperationId: result.externalOperationId,
		};
	}

	private async runExternalOperation(
		distribution: DistributionV2,
		kind: 'UPC' | 'ISRC',
		requestId: string,
		idempotencyKey: string,
		input: object,
		call: () => Promise<ProvisionedIdentifier>,
	): Promise<ProvisionedIdentifier & { externalOperationId: string }> {
		const operationType =
			kind === 'UPC' ? 'PROVISION_UPC' : 'PROVISION_ISRC';
		const operation = await this.dataSource.transaction(async (manager) => {
			const repo = manager.getRepository(ExternalOperationV2);
			await repo
				.createQueryBuilder()
				.insert()
				.values({
					provider: 'isrc-upc-generator',
					operationType,
					idempotencyKey,
					requestPayload: {
						consumer: 'distribution-v2',
						requestId,
						distributionId: distribution.id,
						...input,
					},
					responsePayload: null,
					externalId: null,
					status: DistributionV2ExternalOperationStatus.PENDING,
					attempts: 0,
					lastError: null,
				})
				.orIgnore()
				.execute();
			const current = await repo.findOne({ where: { idempotencyKey } });
			if (!current)
				throw new Error(`external operation ${idempotencyKey} missing`);
			if (
				current.status ===
				DistributionV2ExternalOperationStatus.SUCCEEDED
			) {
				const value = readOperationValue(current.responsePayload);
				if (value) {
					return {
						current,
						replayed: true,
						value,
					};
				}
			}
			current.status = DistributionV2ExternalOperationStatus.PENDING;
			current.attempts += 1;
			current.lastError = null;
			await repo.save(current);
			return { current, replayed: false, value: null };
		});

		if (operation.replayed && operation.value) {
			return {
				kind,
				value: operation.value,
				requestId,
				externalId: operation.current.externalId,
				response: operation.current.responsePayload ?? undefined,
				externalOperationId: operation.current.id,
			};
		}

		try {
			const result = await call();
			const value = normalizeIdentifier(result.value);
			if (!value)
				throw new Error(`${kind} generator returned an empty value`);
			operation.current.status =
				DistributionV2ExternalOperationStatus.SUCCEEDED;
			operation.current.responsePayload = {
				value,
				kind,
				requestId,
				externalId: result.externalId ?? null,
				response: result.response ?? null,
			};
			operation.current.externalId = result.externalId ?? null;
			operation.current.lastError = null;
			await this.dataSource
				.getRepository(ExternalOperationV2)
				.save(operation.current);
			return {
				...result,
				kind,
				value,
				externalOperationId: operation.current.id,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			// A timeout may have committed at the provider. UNKNOWN makes
			// the next attempt reconcile with the same request id.
			operation.current.status =
				DistributionV2ExternalOperationStatus.UNKNOWN;
			operation.current.lastError = message;
			await this.dataSource
				.getRepository(ExternalOperationV2)
				.save(operation.current);
			throw error;
		}
	}

	private async findAssignment(
		kind: 'UPC' | 'ISRC',
		requestId: string,
	): Promise<IdentifierAssignmentV2 | null> {
		return this.dataSource
			.getRepository(IdentifierAssignmentV2)
			.findOne({ where: { kind, requestId } });
	}

	private async saveAssignment(
		distribution: DistributionV2,
		kind: 'UPC' | 'ISRC',
		source: 'release.upc' | 'track.isrc' | 'video.isrc',
		trackId: string | null,
		requestId: string,
		idempotencyKey: string,
		result: ProvisionedIdentifier & { externalOperationId: string },
	): Promise<void> {
		const repo = this.dataSource.getRepository(IdentifierAssignmentV2);
		await repo
			.createQueryBuilder()
			.insert()
			.values({
				distributionId: distribution.id,
				releaseId: distribution.releaseId,
				trackId,
				kind,
				source,
				value: result.value,
				requestId,
				idempotencyKey,
				externalOperationId: result.externalOperationId,
			})
			.orIgnore()
			.execute();
	}

	private async syncReleaseIdentifier(
		manager: EntityManager,
		releaseId: string,
		value: string,
	): Promise<void> {
		const result = await manager
			.createQueryBuilder()
			.update(Release)
			.set({ upc: value })
			.where('"id" = :releaseId', { releaseId })
			.andWhere('("upc" IS NULL OR "upc" = :value)', { value })
			.execute();
		if (Number(result.affected ?? 0) > 0) return;
		const current = await manager
			.getRepository(Release)
			.findOne({ where: { id: releaseId } });
		if (normalizeIdentifier(current?.upc) !== value) {
			throw new Error(
				`release ${releaseId} has a conflicting UPC; source was not overwritten`,
			);
		}
	}

	private async syncTrackIdentifier(
		manager: EntityManager,
		trackId: string,
		value: string,
	): Promise<void> {
		const result = await manager
			.createQueryBuilder()
			.update(Track)
			.set({ isrc: value })
			.where('"id" = :trackId', { trackId })
			.andWhere('("isrc" IS NULL OR "isrc" = :value)', { value })
			.execute();
		if (Number(result.affected ?? 0) > 0) return;
		const current = await manager
			.getRepository(Track)
			.findOne({ where: { id: trackId } });
		if (normalizeIdentifier(current?.isrc) !== value) {
			throw new Error(
				`track ${trackId} has a conflicting ISRC; source was not overwritten`,
			);
		}
	}

	private async syncVideoIdentifier(
		manager: EntityManager,
		videoId: string,
		value: string,
	): Promise<void> {
		const result = await manager
			.createQueryBuilder()
			.update(Video)
			.set({ isrc: value })
			.where('"id" = :videoId', { videoId })
			.andWhere('("isrc" IS NULL OR "isrc" = :value)', { value })
			.execute();
		if (Number(result.affected ?? 0) > 0) return;
		const current = await manager
			.getRepository(Video)
			.findOne({ where: { id: videoId } });
		if (normalizeIdentifier(current?.isrc) !== value) {
			throw new Error(
				`video ${videoId} has a conflicting ISRC; source was not overwritten`,
			);
		}
	}

	private async completeProvisioning(
		distributionId: string,
		identifiers: Record<string, string>,
		commandId: string,
		occurredAt: string,
	): Promise<DistributionV2> {
		return this.dataSource.transaction(async (manager) => {
			const distributionRepo = manager.getRepository(DistributionV2);
			const distribution = await distributionRepo.findOne({
				where: { id: distributionId },
			});
			if (!distribution)
				throw new Error(`distribution ${distributionId} missing`);
			if (distribution.status !== DistributionV2Status.PROVISIONING_IDS) {
				return distribution;
			}

			const channels = await manager
				.getRepository(ChannelDeliveryV2)
				.find({ where: { distributionId } });
			const aggregate = Distribution.rehydrate({
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
			});
			const events = aggregate.apply({
				type: 'IDENTIFIERS_PROVISIONED',
				commandId,
				occurredAt,
				identifiers,
			});
			const next = aggregate.state;
			distribution.status = next.status;
			distribution.version = next.version;
			distribution.lastCommandId = commandId;
			await distributionRepo.save(distribution);

			const eventRepo = manager.getRepository(DistributionEventV2);
			for (const domainEvent of events) {
				await eventRepo.save(
					eventRepo.create({
						distributionId,
						channelId: domainEvent.channelId ?? null,
						stepId: null,
						eventType: domainEvent.type,
						level: 'milestone',
						payload: {
							...domainEvent.payload,
							identifiers,
						},
						correlationId: distribution.correlationId,
						occurredAt: new Date(domainEvent.occurredAt),
					}),
				);
			}
			await eventRepo.save(
				eventRepo.create({
					distributionId,
					channelId: null,
					stepId: null,
					eventType: 'distribution.source_identifiers_synced',
					level: 'milestone',
					payload: { identifiers },
					correlationId: distribution.correlationId,
					occurredAt: new Date(occurredAt),
				}),
			);

			const outboxRepo = manager.getRepository(OutboxEventV2);
			await outboxRepo
				.createQueryBuilder()
				.insert()
				.values({
					distributionId,
					queueName: 'build-package',
					payload: {
						distributionId,
						correlationId: distribution.correlationId,
						snapshotId: distribution.snapshotId,
						command: 'BUILD_PACKAGE',
						commandId: `${commandId}:build-package`,
						occurredAt,
					},
					jobId: `${distributionId}:build-package:${distribution.snapshotId}`,
					availableAt: new Date(),
					leaseUntil: null,
					attempts: 0,
					lastError: null,
					lastAttemptedAt: null,
					dispatchedAt: null,
				})
				.orIgnore()
				.execute();
			return distribution;
		});
	}
}

function readSnapshotRelease(
	payload: Record<string, unknown>,
): SnapshotRelease | null {
	const release = (payload as SnapshotPayload).release;
	if (!release || typeof release !== 'object' || !release.id) return null;
	return release;
}

function readOperationValue(
	payload: Record<string, unknown> | null,
): string | null {
	const value = payload?.value;
	return typeof value === 'string' ? normalizeIdentifier(value) : null;
}

function normalizeIdentifier(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized || null;
}

function firstText(...values: unknown[]): string {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return '';
}

function numberOr(...values: unknown[]): number {
	for (const value of values) {
		const number = Number(value);
		if (Number.isFinite(number) && number >= 0) return number;
	}
	return 0;
}
