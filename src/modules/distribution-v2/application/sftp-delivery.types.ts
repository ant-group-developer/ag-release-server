export interface DistributionV2SftpUploadJobPayload {
	readonly distributionId: string;
	readonly channelId: string;
	readonly stepId?: string;
	readonly packageStepId: string;
	readonly attemptId?: string;
	readonly packageUri: string;
	readonly externalId: string;
	readonly attemptNo: number;
	readonly correlationId?: string;
	readonly idempotencyKey: string;
	readonly commandId?: string;
	readonly occurredAt?: string;
}
