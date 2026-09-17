export interface DistributionV2ProvisionIdJobPayload {
	readonly distributionId: string;
	readonly correlationId?: string;
	readonly snapshotId?: string;
	readonly commandId?: string;
	readonly occurredAt?: string;
}

export interface DistributionV2ProvisioningResult {
	readonly distributionId: string;
	readonly status: string;
	readonly identifiers: Readonly<Record<string, string>>;
	readonly reusedCount: number;
	readonly provisionedCount: number;
}
