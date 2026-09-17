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
import * as fs from 'fs';
import Redis from 'ioredis';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { PackageManifest } from '../../application/ports/package-builder.port';
import {
	DISTRIBUTION_V2_SFTP_CONFIG_RESOLVER,
	DISTRIBUTION_V2_SFTP_TRANSPORT,
	DistributionV2SftpConfigResolver,
	DistributionV2SftpTransport,
	SftpUploadReceipt,
} from '../../application/ports/sftp-delivery.port';
import { DistributionV2SftpUploadJobPayload } from '../../application/sftp-delivery.types';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';
import { Distribution } from '../../domain';
import { ChannelDeliveryV2 } from '../../entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from '../../entities/distribution-event-v2.entity';
import { DistributionV2 } from '../../entities/distribution-v2.entity';
import { IssueV2 } from '../../entities/issue-v2.entity';
import { StepRunV2 } from '../../entities/step-run-v2.entity';
import {
	DistributionV2ChannelRoute,
	DistributionV2ChannelStatus,
	DistributionV2StepStatus,
	DistributionV2WaitReason,
} from '../../enums/distribution-v2.enum';
import { distributionV2ConnectionOptions } from '../queue/distribution-v2.queue.service';

interface SftpStepContext {
	readonly step: StepRunV2;
	readonly completed: SftpUploadReceipt | null;
}

@Injectable()
export class DistributionV2SftpUploadWorker
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(DistributionV2SftpUploadWorker.name);
	private worker: Worker | null = null;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		@InjectDataSource() private readonly dataSource: DataSource,
		private readonly config: DistributionV2ConfigService,
		@Inject(DISTRIBUTION_V2_SFTP_CONFIG_RESOLVER)
		private readonly configResolver: DistributionV2SftpConfigResolver,
		@Inject(DISTRIBUTION_V2_SFTP_TRANSPORT)
		private readonly transport: DistributionV2SftpTransport,
	) {}

	onModuleInit(): void {
		if (!this.config.isEnabled()) {
			this.logger.log(
				'Distribution-v2 is disabled; sftp-upload worker is idle',
			);
			return;
		}
		this.worker = new Worker(
			`${this.config.getQueuePrefix()}.sftp-upload`,
			async (job: Job) => this.handle(job),
			{
				connection: distributionV2ConnectionOptions(this.redis),
				concurrency: this.config.getWorkerConcurrency(),
				autorun: true,
			},
		);
		this.worker.on('completed', (job) => {
			this.logger.debug(
				`Completed sftp-upload job ${job.id ?? '<unknown>'}`,
			);
		});
		this.worker.on('failed', (job, error) => {
			this.logger.error(
				`SFTP upload job ${job?.id ?? '<unknown>'} failed: ${error.message}`,
				error.stack,
			);
		});
		this.logger.log(
			`Started ${this.config.getQueuePrefix()}.sftp-upload worker`,
		);
	}

	async handle(
		job: Job<DistributionV2SftpUploadJobPayload>,
	): Promise<SftpUploadReceipt | { distributionId: string; status: string }> {
		const payload = job.data;
		const distribution = await this.dataSource
			.getRepository(DistributionV2)
			.findOne({ where: { id: payload.distributionId } });
		if (!distribution) {
			throw new Error(`distribution ${payload.distributionId} not found`);
		}
		const channel = await this.dataSource
			.getRepository(ChannelDeliveryV2)
			.findOne({
				where: {
					id: payload.channelId,
					distributionId: payload.distributionId,
				},
			});
		if (!channel) {
			throw new Error(
				`channel ${payload.channelId} not found for distribution ${payload.distributionId}`,
			);
		}
		if (channel.route !== DistributionV2ChannelRoute.DIRECT) {
			return {
				distributionId: distribution.id,
				status: 'SKIPPED_NON_DIRECT',
			};
		}
		if (
			channel.status === DistributionV2ChannelStatus.LIVE ||
			channel.status === DistributionV2ChannelStatus.TAKEN_DOWN ||
			channel.status === DistributionV2ChannelStatus.ISSUES
		) {
			return { distributionId: distribution.id, status: channel.status };
		}

		const step = await this.startStep(payload, channel);
		if (step.completed) return step.completed;

		try {
			await this.startProcessing(
				distribution.id,
				channel.id,
				step.step.id,
				payload,
			);
			const packageData = await readPackageChannel(
				this.config.getPackageSharedRoot(),
				payload,
			);
			const connection = await this.configResolver.resolve(
				channel.dspCode,
			);
			const receipt = await this.transport.upload({
				packageRoot: packageData.packageRoot,
				remoteBasePath: connection.basePath ?? '/',
				files: packageData.files,
				connection,
				idempotencyKey: payload.idempotencyKey,
				timeoutMs: this.config.getSftpTimeoutMs(),
			});
			await this.completeStep(
				payload,
				step.step.id,
				receipt,
				new Date().toISOString(),
				new Date(
					Date.now() + this.config.getPartnerTimeoutMs(),
				).toISOString(),
			);
			return receipt;
		} catch (error) {
			const configuredMaxAttempts = this.config.getSftpMaxAttempts();
			const queueMaxAttempts = job.opts.attempts ?? configuredMaxAttempts;
			const finalAttempt =
				job.attemptsMade + 1 >=
				Math.min(queueMaxAttempts, configuredMaxAttempts);
			await this.recordFailure(
				payload,
				step.step.id,
				error instanceof Error ? error : new Error(String(error)),
				finalAttempt,
				job.attemptsMade + 1,
			);
			if (!finalAttempt) throw error;
			return {
				distributionId: distribution.id,
				status: DistributionV2ChannelStatus.ISSUES,
			};
		}
	}

	private async startStep(
		payload: DistributionV2SftpUploadJobPayload,
		channel: ChannelDeliveryV2,
	): Promise<SftpStepContext> {
		return this.dataSource.transaction(async (manager) => {
			const repo = manager.getRepository(StepRunV2);
			const latest = await repo.findOne({
				where: {
					distributionId: payload.distributionId,
					channelId: channel.id,
					stepType: 'DIRECT_SFTP_UPLOAD',
					idempotencyKey: payload.idempotencyKey,
				},
				order: { attemptNo: 'DESC', createdAt: 'DESC' },
			});
			if (latest?.status === DistributionV2StepStatus.DONE) {
				return {
					step: latest,
					completed: latest.output as unknown as SftpUploadReceipt,
				};
			}
			if (latest?.status === DistributionV2StepStatus.PROCESSING) {
				return { step: latest, completed: null };
			}
			const step = repo.create({
				distributionId: payload.distributionId,
				channelId: channel.id,
				stepType: 'DIRECT_SFTP_UPLOAD',
				status: DistributionV2StepStatus.PROCESSING,
				attemptNo: (latest?.attemptNo ?? 0) + 1,
				idempotencyKey: payload.idempotencyKey,
				input: {
					...payload,
					channelStatus: channel.status,
				},
				output: null,
				error: null,
				startedAt: new Date(),
				completedAt: null,
			});
			await repo.save(step);
			return { step, completed: null };
		});
	}

	private async startProcessing(
		distributionId: string,
		channelId: string,
		stepId: string,
		payload: DistributionV2SftpUploadJobPayload,
	): Promise<void> {
		await this.applyChannelCommand(
			distributionId,
			channelId,
			stepId,
			{
				type: 'START_PROCESSING',
				stage: 'SFTP_UPLOAD',
			},
			`${payload.idempotencyKey}:processing`,
			payload.occurredAt ?? new Date().toISOString(),
		);
	}

	private async completeStep(
		payload: DistributionV2SftpUploadJobPayload,
		stepId: string,
		receipt: SftpUploadReceipt,
		occurredAt: string,
		scheduledAt: string,
	): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			const step = await manager
				.getRepository(StepRunV2)
				.findOne({ where: { id: stepId } });
			if (!step || step.status === DistributionV2StepStatus.DONE) return;
			const distribution = await manager
				.getRepository(DistributionV2)
				.findOne({ where: { id: payload.distributionId } });
			if (!distribution) throw new Error('distribution not found');
			const channels = await manager
				.getRepository(ChannelDeliveryV2)
				.find({ where: { distributionId: distribution.id } });
			const aggregate = rehydrateDistribution(distribution, channels);
			const channel = channels.find(
				(item) => item.id === payload.channelId,
			);
			if (!channel) throw new Error('channel not found');
			const events =
				channel.status === DistributionV2ChannelStatus.PROCESSING
					? aggregate.apply({
							type: 'CHANNEL_COMMAND',
							commandId: `${payload.idempotencyKey}:waiting`,
							occurredAt,
							channelId: channel.id,
							channelCommand: {
								type: 'WAIT_EXTERNAL',
								reason: DistributionV2WaitReason.PARTNER,
								scheduledAt,
								stage: 'SFTP_UPLOAD',
								externalRefs: {
									sftp: receipt,
									packageUri: payload.packageUri,
									attemptNo: payload.attemptNo,
								},
							},
						})
					: [];
			applyAggregateState(distribution, channels, aggregate);
			await manager.getRepository(DistributionV2).save(distribution);
			await saveEvents(manager, distribution, events, stepId);
			step.status = DistributionV2StepStatus.DONE;
			step.output = receipt as unknown as Record<string, unknown>;
			step.error = null;
			step.completedAt = new Date();
			await manager.getRepository(StepRunV2).save(step);
		});
	}

	private async recordFailure(
		payload: DistributionV2SftpUploadJobPayload,
		stepId: string,
		error: Error,
		finalAttempt: boolean,
		attemptNo: number,
	): Promise<void> {
		if (!finalAttempt) {
			await this.dataSource.getRepository(StepRunV2).update(stepId, {
				error: {
					code: 'SFTP_UPLOAD_RETRYING',
					message: error.message,
					attemptNo,
				},
			});
			return;
		}
		await this.dataSource.transaction(async (manager) => {
			const distribution = await manager
				.getRepository(DistributionV2)
				.findOne({ where: { id: payload.distributionId } });
			if (!distribution) throw new Error('distribution not found');
			const channels = await manager
				.getRepository(ChannelDeliveryV2)
				.find({ where: { distributionId: distribution.id } });
			const channel = channels.find(
				(item) => item.id === payload.channelId,
			);
			if (!channel) throw new Error('channel not found');
			const step = await manager
				.getRepository(StepRunV2)
				.findOne({ where: { id: stepId } });
			if (!step) throw new Error('step not found');
			const aggregate = rehydrateDistribution(distribution, channels);
			const events =
				channel.status !== DistributionV2ChannelStatus.ISSUES
					? aggregate.apply({
							type: 'CHANNEL_COMMAND',
							commandId: `${payload.idempotencyKey}:issue`,
							occurredAt: new Date().toISOString(),
							channelId: channel.id,
							channelCommand: {
								type: 'OPEN_ISSUE',
								code: 'SFTP_UPLOAD_FAILED',
								message: error.message,
								stage: 'SFTP_UPLOAD',
								details: {
									attemptNo,
									externalId: payload.externalId,
								},
							},
						})
					: [];
			applyAggregateState(distribution, channels, aggregate);
			await manager.getRepository(DistributionV2).save(distribution);
			await saveEvents(manager, distribution, events, stepId);
			await manager.getRepository(IssueV2).save(
				manager.getRepository(IssueV2).create({
					distributionId: distribution.id,
					channelId: channel.id,
					stepId,
					code: 'SFTP_UPLOAD_FAILED',
					severity: 'ERROR',
					message: error.message,
					rawPayload: {
						attemptNo,
						externalId: payload.externalId,
						idempotencyKey: payload.idempotencyKey,
					},
				}),
			);
			step.status = DistributionV2StepStatus.FAILED;
			step.error = {
				code: 'SFTP_UPLOAD_FAILED',
				message: error.message,
				attemptNo,
			};
			step.completedAt = new Date();
			await manager.getRepository(StepRunV2).save(step);
		});
	}

	private async applyChannelCommand(
		distributionId: string,
		channelId: string,
		stepId: string,
		channelCommand: Record<string, unknown>,
		commandId: string,
		occurredAt: string,
	): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			const distribution = await manager
				.getRepository(DistributionV2)
				.findOne({ where: { id: distributionId } });
			if (!distribution) throw new Error('distribution not found');
			const channels = await manager
				.getRepository(ChannelDeliveryV2)
				.find({ where: { distributionId } });
			const channel = channels.find((item) => item.id === channelId);
			if (!channel) throw new Error('channel not found');
			if (
				channel.status !== DistributionV2ChannelStatus.PENDING &&
				channel.status !==
					DistributionV2ChannelStatus.WAITING_EXTERNAL &&
				channel.status !== DistributionV2ChannelStatus.WAITING_BATCH
			) {
				return;
			}
			const aggregate = rehydrateDistribution(distribution, channels);
			const events = aggregate.apply({
				type: 'CHANNEL_COMMAND',
				commandId,
				occurredAt,
				channelId,
				channelCommand: channelCommand as never,
			});
			applyAggregateState(distribution, channels, aggregate);
			await manager.getRepository(DistributionV2).save(distribution);
			await saveEvents(manager, distribution, events, stepId);
		});
	}

	async onModuleDestroy(): Promise<void> {
		if (this.worker) await this.worker.close();
		this.worker = null;
	}
}

async function readPackageChannel(
	sharedRoot: string,
	payload: DistributionV2SftpUploadJobPayload,
): Promise<{
	packageRoot: string;
	files: {
		path: string;
		size: number;
		sha256: string;
		kind: 'resource' | 'message' | 'marker';
	}[];
}> {
	const expectedUri = `${payload.distributionId}/${payload.attemptNo}`;
	if (payload.packageUri !== expectedUri) {
		throw new Error(
			`packageUri ${payload.packageUri} does not match distribution attempt`,
		);
	}
	const root = path.resolve(sharedRoot);
	const packageRoot = path.resolve(root, ...payload.packageUri.split('/'));
	if (packageRoot !== root && !packageRoot.startsWith(`${root}${path.sep}`)) {
		throw new Error('packageUri escapes shared package root');
	}
	const manifestPath = path.join(packageRoot, 'manifest.json');
	const manifest = JSON.parse(
		await fs.promises.readFile(manifestPath, 'utf8'),
	) as PackageManifest;
	if (
		manifest.distributionId !== payload.distributionId ||
		manifest.attemptNo !== payload.attemptNo
	) {
		throw new Error('package manifest does not match distribution attempt');
	}
	const channel = manifest.channels.find(
		(item) => item.channelId === payload.channelId,
	);
	if (!channel || channel.externalId !== payload.externalId) {
		throw new Error(
			`package manifest does not contain channel ${payload.channelId}`,
		);
	}
	const files = manifest.files
		.filter(
			(file) =>
				file.channelId === payload.channelId &&
				file.kind !== 'manifest',
		)
		.map((file) => ({
			path: file.path,
			size: file.size,
			sha256: file.sha256,
			kind: file.kind as 'resource' | 'message' | 'marker',
		}));
	if (!files.some((file) => file.kind === 'marker')) {
		throw new Error(`channel ${payload.channelId} has no package marker`);
	}
	return { packageRoot, files };
}

function rehydrateDistribution(
	distribution: DistributionV2,
	channels: readonly ChannelDeliveryV2[],
): Distribution {
	return Distribution.rehydrate({
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
}

function applyAggregateState(
	distribution: DistributionV2,
	channels: ChannelDeliveryV2[],
	aggregate: Distribution,
): void {
	distribution.status = aggregate.status;
	distribution.version = aggregate.state.version;
	distribution.lastCommandId = aggregate.state.lastCommandId ?? null;
	for (const next of aggregate.channels) {
		const entity = channels.find((channel) => channel.id === next.id);
		if (!entity) continue;
		entity.status = next.status;
		entity.currentStage = next.currentStage ?? null;
		entity.retryCount = next.retryCount;
		entity.waitReason = next.waitReason ?? null;
		entity.scheduledAt = next.scheduledAt
			? new Date(next.scheduledAt)
			: null;
		entity.lastError = next.lastError ? { ...next.lastError } : null;
		entity.externalRefs = { ...(next.externalRefs ?? {}) };
		entity.lastCommandId = next.lastCommandId ?? null;
	}
}

async function saveEvents(
	manager: EntityManager,
	distribution: DistributionV2,
	events: readonly {
		readonly type: string;
		readonly channelId?: string;
		readonly payload: Readonly<Record<string, unknown>>;
		readonly occurredAt: string;
	}[],
	stepId: string,
): Promise<void> {
	const repo = manager.getRepository(DistributionEventV2);
	for (const event of events) {
		await repo.save(
			repo.create({
				distributionId: distribution.id,
				channelId: event.channelId ?? null,
				stepId,
				eventType: event.type,
				level: 'milestone',
				payload: { ...event.payload },
				correlationId: distribution.correlationId,
				occurredAt: new Date(event.occurredAt),
			}),
		);
	}
}
