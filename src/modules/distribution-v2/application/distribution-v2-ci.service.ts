import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DistributionV2ConfigService } from '../config/distribution-v2.config.service';
import { Distribution } from '../domain';
import { ChannelDeliveryV2 } from '../entities/channel-delivery-v2.entity';
import { DistributionEventV2 } from '../entities/distribution-event-v2.entity';
import { DistributionV2 } from '../entities/distribution-v2.entity';
import { ExternalOperationV2 } from '../entities/external-operation-v2.entity';
import { IssueV2 } from '../entities/issue-v2.entity';
import { OutboxEventV2 } from '../entities/outbox-event-v2.entity';
import { StepRunV2 } from '../entities/step-run-v2.entity';
import {
	DistributionV2ChannelRoute,
	DistributionV2ChannelStatus,
	DistributionV2ExternalOperationStatus,
	DistributionV2IssueStatus,
	DistributionV2Status,
	DistributionV2StepStatus,
	DistributionV2WaitReason,
} from '../enums/distribution-v2.enum';
import {
	DistributionV2CiImportCheckJobPayload,
	DistributionV2CiImportGroupInput,
	DistributionV2CiPipelineResult,
	DistributionV2CiQaCheckJobPayload,
} from './distribution-v2-ci.types';
import {
	DISTRIBUTION_V2_CI_IMPORT_QA,
	DistributionV2CiImportQaPort,
} from './ports/ci-import-qa.port';

const CI_CHANNEL_ROUTES = new Set<DistributionV2ChannelRoute>([
	DistributionV2ChannelRoute.CI,
	DistributionV2ChannelRoute.STATE51,
]);

@Injectable()
export class DistributionV2CiService {
	constructor(
		@InjectDataSource() private readonly dataSource: DataSource,
		private readonly config: DistributionV2ConfigService,
		@Inject(DISTRIBUTION_V2_CI_IMPORT_QA)
		private readonly ci: DistributionV2CiImportQaPort,
	) {}

	/**
	 * Registers the result of the CI package upload and starts one ingest group
	 * for all CI/State51 channels that share the same aggregator.
	 *
	 * The upload itself is intentionally outside this phase. The upload worker
	 * calls this method after its completion marker has been accepted.
	 */
	async registerImportGroup(
		input: DistributionV2CiImportGroupInput,
	): Promise<DistributionV2CiPipelineResult> {
		const normalized = normalizeGroupInput(input);
		return this.dataSource.transaction(async (manager) => {
			const distribution = await manager
				.getRepository(DistributionV2)
				.findOne({ where: { id: normalized.distributionId } });
			if (!distribution) {
				throw new Error(
					`distribution-v2 ${normalized.distributionId} was not found`,
				);
			}
			if (distribution.status !== DistributionV2Status.DISTRIBUTING) {
				throw new Error(
					`CI import group requires DISTRIBUTING distribution, got ${distribution.status}`,
				);
			}

			const channels = await manager
				.getRepository(ChannelDeliveryV2)
				.find({ where: { distributionId: distribution.id } });
			const groupChannels = selectGroupChannels(channels, normalized);
			if (groupChannels.length === 0) {
				throw new Error(
					`no CI channels found for aggregator ${normalized.aggregatorCode}`,
				);
			}

			const groupKey = ciGroupKey(normalized);
			await ensureExternalOperation(manager, {
				provider: 'CI',
				operationType: 'IMPORT',
				idempotencyKey: groupKey,
				requestPayload: { ...normalized },
			});

			const aggregate = rehydrateDistribution(distribution, channels);
			const events = [];
			for (const channel of groupChannels) {
				if (channel.status === DistributionV2ChannelStatus.PENDING) {
					events.push(
						...aggregate.apply({
							type: 'CHANNEL_COMMAND',
							commandId: `${groupKey}:${channel.id}:processing`,
							occurredAt: new Date().toISOString(),
							channelId: channel.id,
							channelCommand: {
								type: 'START_PROCESSING',
								stage: 'CI_IMPORT',
							},
						}),
					);
					events.push(
						...aggregate.apply({
							type: 'CHANNEL_COMMAND',
							commandId: `${groupKey}:${channel.id}:waiting`,
							occurredAt: new Date().toISOString(),
							channelId: channel.id,
							channelCommand: {
								type: 'WAIT_EXTERNAL',
								reason: DistributionV2WaitReason.CI_IMPORT,
								scheduledAt:
									normalized.scheduledAt ??
									new Date().toISOString(),
								stage: 'CI_IMPORT',
								externalRefs: {
									aggregatorCode: normalized.aggregatorCode,
									upc: normalized.upc,
									importExternalIdentifier:
										normalized.importExternalIdentifier,
								},
							},
						}),
					);
				}
			}

			applyAggregateState(distribution, channels, aggregate);
			await manager.getRepository(DistributionV2).save(distribution);
			await saveEvents(manager, distribution, events, null);
			await enqueueOutbox(manager, {
				distributionId: distribution.id,
				queueName: 'ci-import-check',
				payload: {
					...normalized,
					pollNo: 0,
				},
				jobId: `${groupKey}:poll:0`,
				availableAt: normalized.scheduledAt
					? new Date(normalized.scheduledAt)
					: new Date(),
			});

			return {
				distributionId: distribution.id,
				aggregatorCode: normalized.aggregatorCode,
				status: 'WAITING_EXTERNAL',
				channelIds: groupChannels.map((channel) => channel.id),
				idempotent: groupChannels.every(
					(channel) =>
						channel.status ===
							DistributionV2ChannelStatus.WAITING_EXTERNAL &&
						channel.waitReason ===
							DistributionV2WaitReason.CI_IMPORT,
				),
			};
		});
	}

	async handleImportCheck(
		payload: DistributionV2CiImportCheckJobPayload,
	): Promise<DistributionV2CiPipelineResult> {
		const normalized = normalizeJobPayload(payload);
		await this.ensureOperation(
			normalized,
			'IMPORT',
			ciGroupKey(normalized),
		);
		const step = await this.startStep(normalized, 'CI_IMPORT_CHECK');
		if (step.status === DistributionV2StepStatus.DONE) {
			return this.result(normalized, 'CI_IMPORT_CHECK_DONE');
		}

		const result = await this.ci.checkImport({
			upc: normalized.upc,
			importExternalIdentifier: normalized.importExternalIdentifier,
			pageSize: this.config.getCiPageSize(),
		});

		if (
			result.status === 'PENDING' ||
			(!result.found && result.status !== 'PROBLEM')
		) {
			if (normalized.pollNo >= this.config.getCiMaxPolls()) {
				return this.openGroupIssue(
					normalized,
					'CI_IMPORT_TIMEOUT',
					`CI import was not available after ${normalized.pollNo} polls`,
					step.id,
					result,
				);
			}
			return this.persistImportPending(normalized, step.id, result);
		}
		if (
			result.status === 'PROBLEM' ||
			result.warnings.length > 0 ||
			result.errors.length > 0
		) {
			return this.openGroupIssue(
				normalized,
				'CI_IMPORT_PROBLEM',
				[result.errors.join('; '), result.warnings.join('; ')]
					.filter(Boolean)
					.join('; ') || 'CI import returned problem status',
				step.id,
				result,
			);
		}
		if (result.status !== 'COMPLETE') {
			return this.openGroupIssue(
				normalized,
				'CI_IMPORT_UNKNOWN',
				'CI import returned an unknown status',
				step.id,
				result,
			);
		}

		return this.persistImportComplete(normalized, step.id, result);
	}

	async handleQaCheck(
		payload: DistributionV2CiQaCheckJobPayload,
	): Promise<DistributionV2CiPipelineResult> {
		const normalized = normalizeJobPayload(payload);
		await this.ensureOperation(normalized, 'QA', qaGroupKey(normalized));
		const step = await this.startStep(normalized, 'CI_QA_CHECK');
		if (step.status === DistributionV2StepStatus.DONE) {
			return this.result(normalized, 'CI_QA_CHECK_DONE');
		}

		const release = normalized.releaseFormatId
			? {
					releaseFormatId: normalized.releaseFormatId,
				}
			: await this.ci.findReleaseByUpc({
					upc: normalized.upc,
					pageSize: this.config.getCiPageSize(),
				});

		if (!release) {
			if (normalized.pollNo >= this.config.getCiMaxPolls()) {
				return this.openGroupIssue(
					normalized,
					'CI_RELEASE_NOT_FOUND',
					`CI release format for UPC ${normalized.upc} was not found`,
					step.id,
					{ upc: normalized.upc },
				);
			}
			return this.persistQaPending(normalized, step.id, {
				status: 'RELEASE_NOT_FOUND',
				checkedAt: new Date().toISOString(),
			});
		}

		const result = await this.ci.checkQa({
			releaseFormatId: release.releaseFormatId,
			pageSize: this.config.getCiPageSize(),
		});
		if (result.blockers.length > 0) {
			return this.openGroupIssue(
				normalized,
				'CI_QA_BLOCKER',
				`CI returned ${result.blockers.length} open blocker(s)`,
				step.id,
				result,
			);
		}

		return this.persistQaComplete(normalized, step.id, result);
	}

	async recordTechnicalFailure(
		payload:
			| DistributionV2CiImportCheckJobPayload
			| DistributionV2CiQaCheckJobPayload,
		stepType: 'CI_IMPORT_CHECK' | 'CI_QA_CHECK',
		error: Error,
	): Promise<DistributionV2CiPipelineResult> {
		const normalized = normalizeJobPayload(payload);
		const step = await this.startStep(normalized, stepType);
		return this.openGroupIssue(
			normalized,
			stepType === 'CI_IMPORT_CHECK'
				? 'CI_IMPORT_API_FAILED'
				: 'CI_QA_API_FAILED',
			error.message,
			step.id,
			{ name: error.name, message: error.message },
		);
	}

	private async persistImportPending(
		input: NormalizedGroupInput,
		stepId: string,
		result: unknown,
	): Promise<DistributionV2CiPipelineResult> {
		const nextPoll = input.pollNo + 1;
		return this.dataSource.transaction(async (manager) => {
			await updateExternalOperation(manager, {
				idempotencyKey: ciGroupKey(input),
				status: DistributionV2ExternalOperationStatus.PENDING,
				responsePayload: {
					result,
					pollNo: input.pollNo,
					checkedAt: new Date().toISOString(),
				},
			});
			await updateStep(manager, stepId, {
				status: DistributionV2StepStatus.WAITING,
				output: {
					status: 'PENDING',
					pollNo: input.pollNo,
					result,
					checkedAt: new Date().toISOString(),
				},
				completedAt: null,
			});
			await enqueueOutbox(manager, {
				distributionId: input.distributionId,
				queueName: 'ci-import-check',
				payload: { ...input, pollNo: nextPoll },
				jobId: `${ciGroupKey(input)}:poll:${nextPoll}`,
				availableAt: new Date(
					Date.now() + this.config.getCiPollIntervalMs(),
				),
			});
			return this.result(input, 'WAITING_EXTERNAL');
		});
	}

	private async persistImportComplete(
		input: NormalizedGroupInput,
		stepId: string,
		result: Awaited<
			ReturnType<DistributionV2CiImportQaPort['checkImport']>
		>,
	): Promise<DistributionV2CiPipelineResult> {
		return this.dataSource.transaction(async (manager) => {
			await updateExternalOperation(manager, {
				idempotencyKey: ciGroupKey(input),
				status: DistributionV2ExternalOperationStatus.SUCCEEDED,
				externalId:
					result.internalBatchId ??
					result.importBatchId ??
					result.importEntityId,
				responsePayload: { ...result },
			});
			await updateStep(manager, stepId, {
				status: DistributionV2StepStatus.DONE,
				output: { ...result },
				completedAt: new Date(),
			});

			const distribution = await findDistribution(manager, input);
			const channels = await findChannels(manager, input);
			const aggregate = rehydrateDistribution(distribution, channels);
			const events = [];
			for (const channel of selectGroupChannels(channels, input)) {
				if (
					channel.status ===
					DistributionV2ChannelStatus.WAITING_EXTERNAL
				) {
					events.push(
						...aggregate.apply({
							type: 'CHANNEL_COMMAND',
							commandId: `${ciGroupKey(input)}:${channel.id}:qa`,
							occurredAt: new Date().toISOString(),
							channelId: channel.id,
							channelCommand: {
								type: 'START_PROCESSING',
								stage: 'CI_QA',
							},
						}),
					);
				}
			}
			applyAggregateState(distribution, channels, aggregate);
			await manager.getRepository(DistributionV2).save(distribution);
			await saveEvents(manager, distribution, events, stepId);
			await enqueueOutbox(manager, {
				distributionId: input.distributionId,
				queueName: 'ci-qa-check',
				payload: { ...input, pollNo: 0 },
				jobId: `${ciGroupKey(input)}:qa:0`,
				availableAt: new Date(),
			});
			return this.result(input, 'CHECKING_QA');
		});
	}

	private async persistQaPending(
		input: NormalizedGroupInput,
		stepId: string,
		result: unknown,
	): Promise<DistributionV2CiPipelineResult> {
		const nextPoll = input.pollNo + 1;
		return this.dataSource.transaction(async (manager) => {
			await updateExternalOperation(manager, {
				idempotencyKey: qaGroupKey(input),
				status: DistributionV2ExternalOperationStatus.PENDING,
				responsePayload: { result, pollNo: input.pollNo },
			});
			await updateStep(manager, stepId, {
				status: DistributionV2StepStatus.WAITING,
				output: { status: 'PENDING', result, pollNo: input.pollNo },
				completedAt: null,
			});
			await enqueueOutbox(manager, {
				distributionId: input.distributionId,
				queueName: 'ci-qa-check',
				payload: { ...input, pollNo: nextPoll },
				jobId: `${qaGroupKey(input)}:poll:${nextPoll}`,
				availableAt: new Date(
					Date.now() + this.config.getCiPollIntervalMs(),
				),
			});
			return this.result(input, 'CHECKING_QA');
		});
	}

	private async persistQaComplete(
		input: NormalizedGroupInput,
		stepId: string,
		result: Awaited<ReturnType<DistributionV2CiImportQaPort['checkQa']>>,
	): Promise<DistributionV2CiPipelineResult> {
		return this.dataSource.transaction(async (manager) => {
			await updateExternalOperation(manager, {
				idempotencyKey: qaGroupKey(input),
				status: DistributionV2ExternalOperationStatus.SUCCEEDED,
				externalId: result.releaseFormatId,
				responsePayload: { ...result },
			});
			await updateStep(manager, stepId, {
				status: DistributionV2StepStatus.DONE,
				output: { ...result },
				completedAt: new Date(),
			});
			const distribution = await findDistribution(manager, input);
			const channels = await findChannels(manager, input);
			const aggregate = rehydrateDistribution(distribution, channels);
			const events = [];
			for (const channel of selectGroupChannels(channels, input)) {
				if (channel.status === DistributionV2ChannelStatus.PROCESSING) {
					events.push(
						...aggregate.apply({
							type: 'CHANNEL_COMMAND',
							commandId: `${qaGroupKey(input)}:${channel.id}:batch`,
							occurredAt: new Date().toISOString(),
							channelId: channel.id,
							channelCommand: {
								type: 'WAIT_BATCH',
								stage: 'CI_QA',
							},
						}),
					);
				}
			}
			applyAggregateState(distribution, channels, aggregate);
			await manager.getRepository(DistributionV2).save(distribution);
			await saveEvents(manager, distribution, events, stepId);
			return this.result(input, 'WAITING_BATCH');
		});
	}

	private async openGroupIssue(
		input: NormalizedGroupInput,
		code: string,
		message: string,
		stepId: string,
		rawPayload: unknown,
	): Promise<DistributionV2CiPipelineResult> {
		return this.dataSource.transaction(async (manager) => {
			await updateExternalOperation(manager, {
				idempotencyKey: code.startsWith('CI_IMPORT')
					? ciGroupKey(input)
					: qaGroupKey(input),
				status: DistributionV2ExternalOperationStatus.FAILED,
				lastError: message,
				responsePayload: rawPayload as Record<string, unknown>,
			});
			await updateStep(manager, stepId, {
				status: DistributionV2StepStatus.FAILED,
				error: { code, message },
				output: { code, message, rawPayload },
				completedAt: new Date(),
			});

			const distribution = await findDistribution(manager, input);
			const channels = await findChannels(manager, input);
			const aggregate = rehydrateDistribution(distribution, channels);
			const events = [];
			for (const channel of selectGroupChannels(channels, input)) {
				if (
					channel.status !== DistributionV2ChannelStatus.ISSUES &&
					channel.status !== DistributionV2ChannelStatus.LIVE &&
					channel.status !== DistributionV2ChannelStatus.TAKEN_DOWN
				) {
					events.push(
						...aggregate.apply({
							type: 'CHANNEL_COMMAND',
							commandId: `${ciGroupKey(input)}:${code}:${channel.id}`,
							occurredAt: new Date().toISOString(),
							channelId: channel.id,
							channelCommand: {
								type: 'OPEN_ISSUE',
								code,
								message,
								stage: 'CI_IMPORT_QA',
								details: {
									aggregatorCode: input.aggregatorCode,
									upc: input.upc,
									importExternalIdentifier:
										input.importExternalIdentifier,
								},
							},
						}),
					);
					const existing = await manager
						.getRepository(IssueV2)
						.findOne({
							where: {
								distributionId: input.distributionId,
								channelId: channel.id,
								code,
								status: DistributionV2IssueStatus.OPEN,
							},
						});
					if (!existing) {
						await manager.getRepository(IssueV2).save(
							manager.getRepository(IssueV2).create({
								distributionId: input.distributionId,
								channelId: channel.id,
								stepId,
								code,
								severity: 'ERROR',
								message,
								rawPayload: rawPayload as Record<
									string,
									unknown
								>,
								status: DistributionV2IssueStatus.OPEN,
								resolvedAt: null,
								resolvedBy: null,
							}),
						);
					}
				}
			}
			applyAggregateState(distribution, channels, aggregate);
			await manager.getRepository(DistributionV2).save(distribution);
			await saveEvents(manager, distribution, events, stepId);
			return this.result(input, 'ACTION_REQUIRED');
		});
	}

	private async startStep(
		input: NormalizedGroupInput,
		stepType: 'CI_IMPORT_CHECK' | 'CI_QA_CHECK',
	): Promise<StepRunV2> {
		const idempotencyKey = `${stepType}:${ciGroupKey(input)}`;
		return this.dataSource.transaction(async (manager) => {
			const repo = manager.getRepository(StepRunV2);
			await repo
				.createQueryBuilder()
				.insert()
				.values({
					distributionId: input.distributionId,
					channelId: null,
					stepType,
					status: DistributionV2StepStatus.PROCESSING,
					attemptNo: 1,
					idempotencyKey,
					input: { ...input },
					output: null,
					error: null,
					startedAt: new Date(),
					completedAt: null,
				})
				.orIgnore()
				.execute();
			const step = await repo.findOneByOrFail({ idempotencyKey });
			if (step.status === DistributionV2StepStatus.WAITING) {
				step.status = DistributionV2StepStatus.PROCESSING;
				step.startedAt = new Date();
				step.error = null;
				await repo.save(step);
			}
			return step;
		});
	}

	private async ensureOperation(
		input: NormalizedGroupInput,
		operationType: 'IMPORT' | 'QA',
		idempotencyKey: string,
	): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			await ensureExternalOperation(manager, {
				provider: 'CI',
				operationType,
				idempotencyKey,
				requestPayload: { ...input },
			});
		});
	}

	private result(
		input: NormalizedGroupInput,
		status: string,
	): DistributionV2CiPipelineResult {
		return {
			distributionId: input.distributionId,
			aggregatorCode: input.aggregatorCode,
			status,
			channelIds: input.channelIds ?? [],
		};
	}
}

interface NormalizedGroupInput {
	readonly distributionId: string;
	readonly aggregatorCode: string;
	readonly upc: string;
	readonly importExternalIdentifier: string;
	readonly channelIds?: readonly string[];
	readonly scheduledAt?: string;
	readonly correlationId?: string;
	readonly pollNo: number;
	readonly releaseFormatId?: string;
}

function normalizeGroupInput(
	input:
		| DistributionV2CiImportGroupInput
		| DistributionV2CiImportCheckJobPayload
		| DistributionV2CiQaCheckJobPayload,
): NormalizedGroupInput {
	const aggregatorCode = input.aggregatorCode.trim().toUpperCase();
	if (!input.distributionId?.trim())
		throw new Error('distributionId is required');
	if (!aggregatorCode) throw new Error('aggregatorCode is required');
	if (!input.upc?.trim()) throw new Error('upc is required');
	if (!input.importExternalIdentifier?.trim()) {
		throw new Error('importExternalIdentifier is required');
	}
	return {
		...input,
		distributionId: input.distributionId.trim(),
		aggregatorCode,
		upc: input.upc.trim(),
		importExternalIdentifier: input.importExternalIdentifier.trim(),
		channelIds: input.channelIds?.filter(Boolean),
		pollNo:
			'pollNo' in input && Number.isInteger(input.pollNo)
				? Number(input.pollNo)
				: 0,
	};
}

function normalizeJobPayload(
	input:
		| DistributionV2CiImportCheckJobPayload
		| DistributionV2CiQaCheckJobPayload,
): NormalizedGroupInput {
	return normalizeGroupInput(input);
}

function ciGroupKey(
	input: Pick<NormalizedGroupInput, 'distributionId' | 'aggregatorCode'>,
): string {
	return `distribution-v2:${input.distributionId}:ci:${input.aggregatorCode}`;
}

function qaGroupKey(
	input: Pick<NormalizedGroupInput, 'distributionId' | 'aggregatorCode'>,
): string {
	return `${ciGroupKey(input)}:qa`;
}

function selectGroupChannels(
	channels: readonly ChannelDeliveryV2[],
	input: Pick<NormalizedGroupInput, 'aggregatorCode' | 'channelIds'>,
): ChannelDeliveryV2[] {
	const requested = input.channelIds ? new Set(input.channelIds) : null;
	return channels.filter(
		(channel) =>
			CI_CHANNEL_ROUTES.has(channel.route) &&
			channel.aggregatorCode?.trim().toUpperCase() ===
				input.aggregatorCode &&
			(!requested || requested.has(channel.id)),
	);
}

async function ensureExternalOperation(
	manager: EntityManager,
	input: {
		readonly provider: string;
		readonly operationType: string;
		readonly idempotencyKey: string;
		readonly requestPayload: Record<string, unknown>;
	},
): Promise<ExternalOperationV2> {
	const repo = manager.getRepository(ExternalOperationV2);
	await repo
		.createQueryBuilder()
		.insert()
		.values({
			provider: input.provider,
			operationType: input.operationType,
			idempotencyKey: input.idempotencyKey,
			requestPayload: input.requestPayload as any,
			responsePayload: null,
			externalId: null,
			status: DistributionV2ExternalOperationStatus.PENDING,
			attempts: 0,
			lastError: null,
		})
		.orIgnore()
		.execute();
	return repo.findOneByOrFail({ idempotencyKey: input.idempotencyKey });
}

async function updateExternalOperation(
	manager: EntityManager,
	input: {
		readonly idempotencyKey: string;
		readonly status: DistributionV2ExternalOperationStatus;
		readonly responsePayload?: Record<string, unknown>;
		readonly externalId?: string | null;
		readonly lastError?: string | null;
	},
): Promise<void> {
	const repo = manager.getRepository(ExternalOperationV2);
	const operation = await repo.findOneByOrFail({
		idempotencyKey: input.idempotencyKey,
	});
	operation.status = input.status;
	operation.attempts += 1;
	operation.responsePayload = input.responsePayload ?? null;
	operation.externalId = input.externalId ?? operation.externalId;
	operation.lastError = input.lastError ?? null;
	await repo.save(operation);
}

async function updateStep(
	manager: EntityManager,
	stepId: string,
	patch: {
		readonly status: DistributionV2StepStatus;
		readonly output?: Record<string, unknown>;
		readonly error?: Record<string, unknown> | null;
		readonly completedAt?: Date | null;
	},
): Promise<void> {
	const repo = manager.getRepository(StepRunV2);
	const step = await repo.findOneByOrFail({ id: stepId });
	step.status = patch.status;
	if (patch.output !== undefined) step.output = patch.output;
	if (patch.error !== undefined) step.error = patch.error;
	if (patch.completedAt !== undefined) step.completedAt = patch.completedAt;
	await repo.save(step);
}

async function enqueueOutbox(
	manager: EntityManager,
	input: {
		readonly distributionId: string;
		readonly queueName: string;
		readonly payload: Record<string, unknown>;
		readonly jobId: string;
		readonly availableAt: Date;
	},
): Promise<void> {
	await manager
		.getRepository(OutboxEventV2)
		.createQueryBuilder()
		.insert()
		.values({
			distributionId: input.distributionId,
			queueName: input.queueName,
			payload: input.payload as any,
			jobId: input.jobId,
			availableAt: input.availableAt,
			leaseUntil: null,
			attempts: 0,
			lastError: null,
			lastAttemptedAt: null,
			dispatchedAt: null,
		})
		.orIgnore()
		.execute();
}

async function findDistribution(
	manager: EntityManager,
	input: NormalizedGroupInput,
): Promise<DistributionV2> {
	const distribution = await manager
		.getRepository(DistributionV2)
		.findOne({ where: { id: input.distributionId } });
	if (!distribution) {
		throw new Error(
			`distribution-v2 ${input.distributionId} was not found`,
		);
	}
	return distribution;
}

async function findChannels(
	manager: EntityManager,
	input: NormalizedGroupInput,
): Promise<ChannelDeliveryV2[]> {
	return manager.getRepository(ChannelDeliveryV2).find({
		where: { distributionId: input.distributionId },
	});
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
	stepId: string | null,
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
