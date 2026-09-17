/**
 * ACL port for the UPC/ISRC generator.
 *
 * The distribution-v2 application depends on this contract only.  It does
 * not know whether the implementation is gRPC, HTTP, or a test double.
 */
export const DISTRIBUTION_V2_IDENTIFIER_PROVISIONER = Symbol(
	'DISTRIBUTION_V2_IDENTIFIER_PROVISIONER',
);

export type DistributionV2IdentifierKind = 'UPC' | 'ISRC';

export interface ProvisionedIdentifier {
	readonly kind: DistributionV2IdentifierKind;
	readonly value: string;
	readonly requestId: string;
	readonly externalId?: string | null;
	readonly response?: Readonly<Record<string, unknown>>;
}

export interface ProvisionUpcInput {
	readonly requestId: string;
	readonly consumer: 'distribution-v2';
	readonly releaseId: string;
	readonly idempotencyKey: string;
	readonly prefixUpcId?: string;
	readonly description?: string | null;
}

export interface ProvisionIsrcInput {
	readonly requestId: string;
	readonly consumer: 'distribution-v2';
	readonly trackId: string;
	readonly idempotencyKey: string;
	readonly prefixIsrcId?: string;
	readonly registrantName?: string;
	readonly recordingArtist?: string;
	readonly recordingTitle?: string;
	readonly versionTitle?: string | null;
	readonly assetType: 'AUDIO' | 'VIDEO';
	readonly immersive?: boolean;
	readonly explicit?: boolean;
	readonly yearOfProduction?: number;
	readonly duration?: number;
	readonly isAdded?: boolean;
}

export interface IdentifierProvisioner {
	provisionUpc(input: ProvisionUpcInput): Promise<ProvisionedIdentifier>;
	provisionIsrc(input: ProvisionIsrcInput): Promise<ProvisionedIdentifier>;
}
