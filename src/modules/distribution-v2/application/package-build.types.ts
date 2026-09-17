export interface DistributionV2BuildPackageJobPayload {
	readonly distributionId: string;
	readonly correlationId?: string;
	readonly snapshotId?: string;
	readonly commandId?: string;
	readonly occurredAt?: string;
}
