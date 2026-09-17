export interface DistributionV2SftpConnection {
	readonly host: string;
	readonly port: number;
	readonly username: string;
	readonly password?: string;
	readonly privateKey?: string;
	readonly basePath?: string;
}

export interface DistributionV2SftpFile {
	readonly path: string;
	readonly size: number;
	readonly sha256: string;
	readonly kind: 'resource' | 'message' | 'marker';
}

export interface SftpUploadInput {
	readonly packageRoot: string;
	readonly remoteBasePath: string;
	readonly files: readonly DistributionV2SftpFile[];
	readonly connection: DistributionV2SftpConnection;
	readonly idempotencyKey: string;
	readonly timeoutMs: number;
}

export interface SftpUploadReceiptFile {
	readonly path: string;
	readonly remotePath: string;
	readonly size: number;
	readonly sha256: string;
	readonly reused: boolean;
}

export interface SftpUploadReceipt {
	readonly host: string;
	readonly remoteBasePath: string;
	readonly idempotencyKey: string;
	readonly files: readonly SftpUploadReceiptFile[];
	readonly markerPath: string;
	readonly uploadedAt: string;
}

export interface DistributionV2SftpConfigResolver {
	resolve(dspCode: string): Promise<DistributionV2SftpConnection>;
}

export interface DistributionV2SftpTransport {
	upload(input: SftpUploadInput): Promise<SftpUploadReceipt>;
}

export interface DistributionV2SftpClient {
	connect(config: {
		host: string;
		port: number;
		username: string;
		password?: string;
		privateKey?: string;
		readyTimeout: number;
		keepaliveInterval: number;
		keepaliveCountMax: number;
	}): Promise<void>;
	mkdir(path: string, recursive?: boolean): Promise<unknown>;
	exists(path: string): Promise<boolean | string>;
	stat(path: string): Promise<{ size: number }>;
	put(localPath: string, remotePath: string): Promise<unknown>;
	end(): Promise<void>;
}

export interface DistributionV2SftpClientFactory {
	create(): DistributionV2SftpClient;
}

export const DISTRIBUTION_V2_SFTP_CONFIG_RESOLVER = Symbol(
	'DISTRIBUTION_V2_SFTP_CONFIG_RESOLVER',
);

export const DISTRIBUTION_V2_SFTP_TRANSPORT = Symbol(
	'DISTRIBUTION_V2_SFTP_TRANSPORT',
);

export const DISTRIBUTION_V2_SFTP_CLIENT_FACTORY = Symbol(
	'DISTRIBUTION_V2_SFTP_CLIENT_FACTORY',
);
