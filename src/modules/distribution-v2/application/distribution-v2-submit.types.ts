import { EntityManager } from 'typeorm';
import {
	DistributionV2ChannelRoute,
	DistributionV2ExecutionType,
	DistributionV2Status,
} from '../enums/distribution-v2.enum';

export interface DistributionV2SubmitInput {
	readonly dspCodes: readonly string[];
	readonly needCiImport?: boolean;
}

export interface DistributionV2Actor {
	readonly userId: string;
	readonly tenantId: string;
	readonly isSystemAdmin?: boolean;
}

export interface DistributionV2ReleaseReadModel {
	readonly id: string;
	readonly tenantId: string;
	readonly type: 'audio' | 'video';
	readonly title: string | null;
	readonly version: string | null;
	readonly upc: string | null;
	readonly status: string;
	readonly updatedAt: Date;
	readonly fields: Readonly<Record<string, unknown>>;
	readonly tenantPolicy?: Readonly<Record<string, unknown>>;
	readonly tracks: readonly DistributionV2TrackReadModel[];
	readonly coverArts: readonly DistributionV2AssetReadModel[];
	readonly video?: Readonly<Record<string, unknown>> | null;
	readonly dspDeliveries: readonly DistributionV2DspDeliveryReadModel[];
}

export interface DistributionV2TrackReadModel {
	readonly id: string;
	readonly order: number;
	readonly title: string | null;
	readonly isrc: string | null;
	readonly fields: Readonly<Record<string, unknown>>;
	readonly audio?: DistributionV2AssetReadModel | null;
}

export interface DistributionV2AssetReadModel {
	readonly id?: string | null;
	readonly fileId: string | null;
	readonly fileName?: string | null;
	readonly key?: string | null;
	readonly bucket?: string | null;
	readonly contentType?: string | null;
	readonly extension?: string | null;
	readonly fileSize?: number | null;
	readonly fields?: Readonly<Record<string, unknown>>;
}

export interface DistributionV2DspDeliveryReadModel {
	readonly id: string;
	readonly dspId: string;
	readonly dspCode: string;
	readonly dspActive: boolean;
	readonly isSelected: boolean;
	readonly status: string | null;
	readonly hasLiveVersion: boolean;
	readonly route: DistributionV2ChannelRoute;
	readonly aggregatorCode?: string | null;
}

export interface DistributionV2SubmitResult {
	readonly distributionId: string;
	readonly correlationId: string;
	readonly snapshotId: string;
	readonly type: DistributionV2ExecutionType;
	readonly status: DistributionV2Status;
	readonly idempotent: boolean;
}

export interface DistributionV2ReviewResult {
	readonly distributionId: string;
	readonly status: DistributionV2Status;
	readonly commandId: string;
	readonly idempotent: boolean;
}

export interface DistributionV2ReleaseReadPort {
	read(
		releaseId: string,
		manager: EntityManager,
	): Promise<DistributionV2ReleaseReadModel | null>;
}

export const DISTRIBUTION_V2_RELEASE_READ_PORT = Symbol(
	'DISTRIBUTION_V2_RELEASE_READ_PORT',
);
