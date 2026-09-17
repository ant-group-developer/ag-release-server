export interface DistributionV2PackageAsset {
	readonly fileId: string | null;
	readonly fileName?: string | null;
	readonly extension?: string | null;
	readonly contentType?: string | null;
	readonly fileSize?: number | null;
}

export interface DistributionV2PackageTrack {
	readonly id: string;
	readonly order: number;
	readonly title?: string | null;
	readonly isrc?: string | null;
	readonly audio?: DistributionV2PackageAsset | null;
}

export interface DistributionV2PackageRelease {
	readonly id: string;
	readonly tenantId?: string;
	readonly type?: string;
	readonly title?: string | null;
	readonly version?: string | null;
	readonly upc?: string | null;
	readonly updatedAt?: string;
	readonly tracks?: readonly DistributionV2PackageTrack[];
	readonly coverArts?: readonly DistributionV2PackageAsset[];
	readonly video?: {
		readonly id?: string;
		readonly isrc?: string | null;
		readonly fileId?: string | null;
		readonly fileName?: string | null;
		readonly extension?: string | null;
		readonly [key: string]: unknown;
	} | null;
	readonly [key: string]: unknown;
}

export interface DistributionV2PackageSnapshot {
	readonly id: string;
	readonly releaseId: string;
	readonly contentHash: string;
	readonly trackOrderHash: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly assetManifest?: Readonly<Record<string, unknown>>;
}

export interface DistributionV2PackageChannel {
	readonly id: string;
	readonly dspCode: string;
	readonly route: string;
	readonly aggregatorCode?: string | null;
}

export interface BuildPackageInput {
	readonly distributionId: string;
	readonly snapshotId: string;
	readonly attemptNo: number;
	readonly snapshot: DistributionV2PackageSnapshot;
	readonly identifiers: Readonly<Record<string, string>>;
	readonly channels: readonly DistributionV2PackageChannel[];
}

export interface PackageWorkspace {
	readonly id: string;
	readonly distributionId: string;
	readonly attemptNo: number;
	readonly rootPath: string;
	readonly packageUri: string;
	readonly leaseUntil: Date;
}

export interface WorkspaceInput {
	readonly distributionId: string;
	readonly attemptNo: number;
	readonly leaseMs: number;
}

export interface PackageFileEntry {
	readonly path: string;
	readonly size: number;
	readonly sha256: string;
	readonly kind: 'resource' | 'message' | 'marker' | 'manifest';
	readonly channelId?: string;
}

export interface PackageManifest {
	readonly schemaVersion: 1;
	readonly distributionId: string;
	readonly snapshotId: string;
	readonly releaseId: string;
	readonly attemptNo: number;
	readonly contentHash: string;
	readonly trackOrderHash: string;
	readonly channels: readonly {
		readonly channelId: string;
		readonly dspCode: string;
		readonly route: string;
		readonly aggregatorCode: string | null;
		readonly externalId: string;
		readonly upc: string;
		readonly messagePath: string;
		readonly markerPath: string;
	}[];
	readonly files: readonly PackageFileEntry[];
}

export interface PackageArtifact {
	readonly workspaceId: string;
	readonly packageUri: string;
	readonly rootPath: string;
	readonly manifestPath: string;
	readonly checksumsPath: string;
	readonly checksum: string;
	readonly attemptNo: number;
	readonly externalIds: Readonly<Record<string, string>>;
	readonly manifest: PackageManifest;
}

export interface PackageBuilder {
	build(input: BuildPackageInput): Promise<PackageArtifact>;
}

export interface PackageStore {
	createWorkspace(input: WorkspaceInput): Promise<PackageWorkspace>;
	writeFile(
		workspaceId: string,
		relativePath: string,
		content: string | Buffer,
	): Promise<void>;
	readFile(workspaceId: string, relativePath: string): Promise<Buffer>;
	fileExists(workspaceId: string, relativePath: string): Promise<boolean>;
	releaseLease(
		workspaceId: string,
		status?: 'ACTIVE' | 'COMPLETED' | 'FAILED',
	): Promise<void>;
	cleanup(workspaceId: string): Promise<void>;
	cleanupOrphans(maxAgeMs: number): Promise<string[]>;
}

export interface PackageAssetReader {
	read(fileId: string): Promise<{
		buffer: Buffer;
		fileName: string;
		extension: string;
		contentType: string;
		fileSize: number;
	}>;
}

export const DISTRIBUTION_V2_PACKAGE_BUILDER = Symbol(
	'DISTRIBUTION_V2_PACKAGE_BUILDER',
);

export const DISTRIBUTION_V2_PACKAGE_STORE = Symbol(
	'DISTRIBUTION_V2_PACKAGE_STORE',
);

export const DISTRIBUTION_V2_PACKAGE_ASSET_READER = Symbol(
	'DISTRIBUTION_V2_PACKAGE_ASSET_READER',
);
