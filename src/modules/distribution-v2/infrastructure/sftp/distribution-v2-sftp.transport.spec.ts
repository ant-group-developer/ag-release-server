import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	DistributionV2SftpClient,
	DistributionV2SftpClientFactory,
	SftpUploadInput,
} from '../../application/ports/sftp-delivery.port';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';
import { DistributionV2SftpTransportImpl } from './distribution-v2-sftp.transport';

describe('DistributionV2SftpTransportImpl', () => {
	let root: string;
	let client: FakeSftpClient;
	let transport: DistributionV2SftpTransportImpl;

	beforeEach(async () => {
		root = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'distribution-v2-sftp-'),
		);
		client = new FakeSftpClient();
		const factory: DistributionV2SftpClientFactory = {
			create: () => client,
		};
		const config = {
			getSftpPerHostConcurrency: () => 2,
			getSftpRateLimitMs: () => 0,
		} as DistributionV2ConfigService;
		transport = new DistributionV2SftpTransportImpl(config, factory);
	});

	afterEach(async () => {
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	it('uploads metadata before resources and marker last', async () => {
		const input = await makeInput(root);

		const receipt = await transport.upload(input);

		expect(client.operations.filter((item) => item.type === 'put')).toEqual(
			[
				{
					type: 'put',
					localPath: path.join(root, 'external', 'upc', 'upc.xml'),
					remotePath: '/incoming/external/upc/upc.xml',
				},
				{
					type: 'put',
					localPath: path.join(
						root,
						'external',
						'upc',
						'resources',
						'audio.wav',
					),
					remotePath: '/incoming/external/upc/resources/audio.wav',
				},
				{
					type: 'put',
					localPath: path.join(root, 'external', 'BatchComplete.xml'),
					remotePath: '/incoming/external/BatchComplete.xml',
				},
			],
		);
		expect(receipt.markerPath).toBe('/incoming/external/BatchComplete.xml');
		expect(client.operations[client.operations.length - 1]).toEqual({
			type: 'end',
		});
	});

	it('reuses an existing remote file with the same size', async () => {
		const input = await makeInput(root);
		client.existing = new Set(
			input.files.map((file) => `/incoming/${file.path}`),
		);
		client.remoteSizes = new Map(
			input.files.map((file) => [`/incoming/${file.path}`, file.size]),
		);

		const receipt = await transport.upload(input);

		expect(
			client.operations.filter((item) => item.type === 'put'),
		).toHaveLength(0);
		expect(receipt.files.every((file) => file.reused)).toBe(true);
	});
});

async function makeInput(root: string): Promise<SftpUploadInput> {
	const files = [
		{
			path: 'external/BatchComplete.xml',
			kind: 'marker' as const,
			content: '<marker/>',
		},
		{
			path: 'external/upc/upc.xml',
			kind: 'message' as const,
			content: '<message/>',
		},
		{
			path: 'external/upc/resources/audio.wav',
			kind: 'resource' as const,
			content: 'audio',
		},
	];
	const manifestFiles: SftpUploadInput['files'][number][] = [];
	for (const file of files) {
		const localPath = path.join(root, ...file.path.split('/'));
		await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
		await fs.promises.writeFile(localPath, file.content);
		manifestFiles.push({
			path: file.path,
			kind: file.kind,
			size: Buffer.byteLength(file.content),
			sha256: createHash('sha256').update(file.content).digest('hex'),
		});
	}
	return {
		packageRoot: root,
		remoteBasePath: '/incoming',
		files: manifestFiles,
		connection: {
			host: 'sftp.example',
			port: 22,
			username: 'distribution',
			password: 'secret',
		},
		idempotencyKey: 'distribution-v2:sftp:1',
		timeoutMs: 5_000,
	};
}

class FakeSftpClient implements DistributionV2SftpClient {
	readonly operations: Array<Record<string, string>> = [];
	existing = new Set<string>();
	remoteSizes = new Map<string, number>();

	connect(): Promise<void> {
		this.operations.push({ type: 'connect' });
		return Promise.resolve();
	}

	mkdir(pathname: string): Promise<void> {
		this.operations.push({ type: 'mkdir', path: pathname });
		return Promise.resolve();
	}

	exists(pathname: string): Promise<boolean> {
		this.operations.push({ type: 'exists', path: pathname });
		return Promise.resolve(this.existing.has(pathname));
	}

	stat(pathname: string): Promise<{ size: number }> {
		this.operations.push({ type: 'stat', path: pathname });
		return Promise.resolve({
			size: this.remoteSizes.get(pathname) ?? 0,
		});
	}

	put(localPath: string, remotePath: string): Promise<void> {
		this.operations.push({
			type: 'put',
			localPath,
			remotePath,
		});
		return Promise.resolve();
	}

	end(): Promise<void> {
		this.operations.push({ type: 'end' });
		return Promise.resolve();
	}
}
