import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Inject,
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { DistributionV2BuildPackageJobPayload } from '../../application/package-build.types';
import {
	DISTRIBUTION_V2_PACKAGE_BUILDER,
	DISTRIBUTION_V2_PACKAGE_STORE,
	PackageArtifact,
	PackageBuilder,
	PackageStore,
} from '../../application/ports/package-builder.port';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';
import { Distribution, DistributionV2Status } from '../../domain';
import { ChannelDeliveryV2 } from '../../entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from '../../entities/distribution-event-v2.entity';
import { DistributionV2 } from '../../entities/distribution-v2.entity';
import { ReleaseSnapshotV2 } from '../../entities/release-snapshot-v2.entity';
import { StepRunV2 } from '../../entities/step-run-v2.entity';
import { DistributionV2StepStatus } from '../../enums/distribution-v2.enum';
import { distributionV2ConnectionOptions } from '../queue/distribution-v2.queue.service';

interface StepContext {
	readonly step: StepRunV2;
	readonly attemptNo: number;
	readonly completed: PackageArtifact | null;
}

@Injectable()
export class DistributionV2BuildPackageWorker
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(DistributionV2BuildPackageWorker.name);
	private worker: Worker | null = null;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		@InjectDataSource() private readonly dataSource: DataSource,
		private readonly config: DistributionV2ConfigService,
		@Inject(DISTRIBUTION_V2_PACKAGE_BUILDER)
		private readonly builder: PackageBuilder,
		@Inject(DISTRIBUTION_V2_PACKAGE_STORE)
		private readonly packageStore: PackageStore,
	) {}

	onModuleInit(): void {
		if (!this.config.isEnabled()) {
			this.logger.log(
				'Distribution-v2 is disabled; build-package worker is idle',
			);
			return;
		}
		this.worker = new Worker(
			`${this.config.getQueuePrefix()}.build-package`,
			async (job: Job) =>
				this.handle(job.data as DistributionV2BuildPackageJobPayload),
			{
				connection: distributionV2ConnectionOptions(this.redis),
				concurrency: this.config.getWorkerConcurrency(),
				autorun: true,
			},
		);
		this.worker.on('completed', (job) => {
			this.logger.debug(
				`Completed build-package job ${job.id ?? '<unknown>'}`,
			);
		});
		this.worker.on('failed', (job, error) => {
			this.logger.error(
				`Build-package job ${job?.id ?? '<unknown>'} failed: ${error.message}`,
				error.stack,
			);
		});
		void this.packageStore
			.cleanupOrphans(this.config.getPackageRetentionMs())
			.catch((error: unknown) => {
				this.logger.warn(
					`Package orphan cleanup failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			});
		this.logger.log(
			`Started ${this.config.getQueuePrefix()}.build-package worker`,
		);
	}

	async handle(
		payload: DistributionV2BuildPackageJobPayload,
	): Promise<PackageArtifact | { distributionId: string; status: string }> {
		const distribution = await this.dataSource
			.getRepository(DistributionV2)
			.findOne({ where: { id: payload.distributionId } });
		if (!distribution) {
			throw new Error(
				`distribution-v2 ${payload.distributionId} was not found`,
			);
		}

		const snapshot = await this.dataSource
			.getRepository(ReleaseSnapshotV2)
			.findOne({ where: { id: distribution.snapshotId } });
		if (!snapshot) {
			throw new Error(
				`snapshot ${distribution.snapshotId} was not found for distribution ${distribution.id}`,
			);
		}
		const stepContext = await this.startStep(
			distribution,
			snapshot.id,
			payload.commandId,
		);
		if (stepContext.completed) return stepContext.completed;
		if (distribution.status !== DistributionV2Status.BUILDING_PACKAGE) {
			return {
				distributionId: distribution.id,
				status: distribution.status,
			};
		}

		try {
			const [channels, assignments] = await Promise.all([
				this.dataSource.getRepository(ChannelDeliveryV2).find({
					where: { distributionId: distribution.id },
				}),
				this.dataSource.query(
					`SELECT "kind", "source", "track_id", "value"
					 FROM "distribution_v2"."identifier_assignments"
					 WHERE "distribution_id" = $1`,
					[distribution.id],
				),
			]);
			const identifiers = buildIdentifierMap(
				distribution.releaseId,
				assignments,
			);
			const artifact = await this.builder.build({
				distributionId: distribution.id,
				snapshotId: snapshot.id,
				attemptNo: stepContext.attemptNo,
				snapshot: {
					id: snapshot.id,
					releaseId: snapshot.releaseId,
					contentHash: snapshot.contentHash,
					trackOrderHash: snapshot.trackOrderHash,
					payload: snapshot.payload,
					assetManifest: snapshot.assetManifest,
				},
				identifiers,
				channels: channels.map((channel) => ({
					id: channel.id,
					dspCode: channel.dspCode,
					route: channel.route,
					aggregatorCode: channel.aggregatorCode,
				})),
			});
			await this.completeStep(
				distribution.id,
				snapshot.id,
				stepContext.step.id,
				artifact,
				payload.commandId ?? `${distribution.id}:build-package`,
				payload.occurredAt ?? new Date().toISOString(),
			);
			return artifact;
		} catch (error) {
			await this.failStep(
				stepContext.step.id,
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	private async startStep(
		distribution: DistributionV2,
		snapshotId: string,
		commandId?: string,
	): Promise<StepContext> {
		return this.dataSource.transaction(async (manager) => {
			const repo = manager.getRepository(StepRunV2);
			const latest = await repo.findOne({
				where: {
					distributionId: distribution.id,
					stepType: 'BUILD_PACKAGE',
				},
				order: { attemptNo: 'DESC', createdAt: 'DESC' },
			});
			if (latest?.status === DistributionV2StepStatus.DONE) {
				return {
					step: latest,
					attemptNo: latest.attemptNo,
					completed: latest.output as unknown as PackageArtifact,
				};
			}
			if (
				latest?.status === DistributionV2StepStatus.PROCESSING &&
				latest.input.snapshotId === snapshotId
			) {
				return {
					step: latest,
					attemptNo: latest.attemptNo,
					completed: null,
				};
			}
			const attemptNo = (latest?.attemptNo ?? 0) + 1;
			const idempotencyKey = [
				'distribution-v2',
				distribution.id,
				'build-package',
				snapshotId,
				attemptNo,
			].join(':');
			const step = repo.create({
				distributionId: distribution.id,
				channelId: null,
				stepType: 'BUILD_PACKAGE',
				status: DistributionV2StepStatus.PROCESSING,
				attemptNo,
				idempotencyKey,
				input: {
					distributionId: distribution.id,
					snapshotId,
					commandId: commandId ?? null,
				},
				output: null,
				error: null,
				startedAt: new Date(),
				completedAt: null,
			});
			await repo.save(step);
			return { step, attemptNo, completed: null };
		});
	}

	private async completeStep(
		distributionId: string,
		snapshotId: string,
		stepId: string,
		artifact: PackageArtifact,
		commandId: string,
		occurredAt: string,
	): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			const distributionRepo = manager.getRepository(DistributionV2);
			const distribution = await distributionRepo.findOne({
				where: { id: distributionId },
			});
			if (!distribution)
				throw new Error(`distribution ${distributionId} missing`);
			const step = await manager
				.getRepository(StepRunV2)
				.findOne({ where: { id: stepId } });
			if (!step) throw new Error(`step ${stepId} missing`);
			if (step.status === DistributionV2StepStatus.DONE) return;

			if (distribution.status === DistributionV2Status.BUILDING_PACKAGE) {
				const channels = await manager
					.getRepository(ChannelDeliveryV2)
					.find({ where: { distributionId } });
				const aggregate = Distribution.rehydrate({
					id: distribution.id,
					releaseId: distribution.releaseId,
					tenantId: distribution.tenantId,
					snapshotId,
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
					type: 'PACKAGE_BUILT',
					commandId,
					occurredAt,
					packageUri: artifact.packageUri,
					checksum: artifact.checksum,
				});
				distribution.status = aggregate.status;
				distribution.version = aggregate.state.version;
				distribution.lastCommandId = commandId;
				await distributionRepo.save(distribution);
				const eventRepo = manager.getRepository(DistributionEventV2);
				for (const event of events) {
					await eventRepo.save(
						eventRepo.create({
							distributionId,
							channelId: event.channelId ?? null,
							stepId,
							eventType: event.type,
							level: 'milestone',
							payload: {
								...event.payload,
								packageUri: artifact.packageUri,
								checksum: artifact.checksum,
								attemptNo: artifact.attemptNo,
							},
							correlationId: distribution.correlationId,
							occurredAt: new Date(event.occurredAt),
						}),
					);
				}
			}
			step.status = DistributionV2StepStatus.DONE;
			step.output = artifact as unknown as Record<string, unknown>;
			step.error = null;
			step.completedAt = new Date();
			await manager.getRepository(StepRunV2).save(step);
		});
	}

	private async failStep(stepId: string, error: Error): Promise<void> {
		await this.dataSource.getRepository(StepRunV2).update(stepId, {
			status: DistributionV2StepStatus.FAILED,
			error: { message: error.message, name: error.name },
			completedAt: new Date(),
		});
	}

	async onModuleDestroy(): Promise<void> {
		if (this.worker) await this.worker.close();
		this.worker = null;
	}
}

function buildIdentifierMap(
	releaseId: string,
	assignments: readonly {
		kind: string;
		source: string;
		track_id: string | null;
		value: string;
	}[],
): Record<string, string> {
	const identifiers: Record<string, string> = {};
	for (const assignment of assignments) {
		if (!assignment.value?.trim()) continue;
		if (assignment.kind === 'UPC' && assignment.source === 'release.upc') {
			identifiers[`release:${releaseId}:upc`] = assignment.value;
		}
		if (assignment.kind === 'ISRC' && assignment.track_id) {
			const prefix =
				assignment.source === 'video.isrc' ? 'video' : 'track';
			identifiers[`${prefix}:${assignment.track_id}:isrc`] =
				assignment.value;
		}
	}
	return identifiers;
}
