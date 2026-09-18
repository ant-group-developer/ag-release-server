export interface DistributionV2CiImportGroupInput {
	readonly distributionId: string;
	readonly aggregatorCode: string;
	readonly upc: string;
	readonly importExternalIdentifier: string;
	readonly channelIds?: readonly string[];
	readonly scheduledAt?: string;
	readonly correlationId?: string;
}

export interface DistributionV2CiImportCheckJobPayload extends DistributionV2CiImportGroupInput {
	readonly pollNo?: number;
}

export interface DistributionV2CiQaCheckJobPayload extends DistributionV2CiImportGroupInput {
	readonly pollNo?: number;
	readonly releaseFormatId?: string;
}

export interface DistributionV2CiPipelineResult {
	readonly distributionId: string;
	readonly aggregatorCode: string;
	readonly status: string;
	readonly channelIds: readonly string[];
	readonly idempotent?: boolean;
}
