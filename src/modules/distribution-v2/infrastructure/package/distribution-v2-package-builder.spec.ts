import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	BuildPackageInput,
	PackageAssetReader,
} from '../../application/ports/package-builder.port';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';
import { DistributionV2PackageBuilder } from './distribution-v2-package.builder';
import { DistributionV2PackageStore } from './distribution-v2-package.store';

describe('DistributionV2PackageBuilder', () => {
	let root: string;
	let config: DistributionV2ConfigService;
	let store: DistributionV2PackageStore;
	let assets: jest.Mocked<PackageAssetReader>;
	let builder: DistributionV2PackageBuilder;

	beforeEach(async () => {
		root = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), 'distribution-v2-package-'),
		);
		config = {
			getPackageSharedRoot: () => root,
			getPackageLeaseMs: () => 60_000,
		} as DistributionV2ConfigService;
		store = new DistributionV2PackageStore(config);
		assets = {
			read: jest.fn((fileId: string) => {
				const content = Buffer.from(`asset:${fileId}`);
				return Promise.resolve({
					buffer: content,
					fileName: `${fileId}.wav`,
					extension: 'wav',
					contentType: 'audio/wav',
					fileSize: content.length,
				});
			}),
		};
		builder = new DistributionV2PackageBuilder(store, assets, config);
	});

	afterEach(async () => {
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	it('builds a deterministic package and resumes from an existing workspace', async () => {
		const input = makeInput();

		const first = await builder.build(input);
		const second = await builder.build(input);

		expect(second.checksum).toBe(first.checksum);
		expect(second.manifest).toEqual(first.manifest);
		expect(second.externalIds).toEqual(first.externalIds);
		expect(await fs.promises.readFile(first.manifestPath, 'utf8')).toBe(
			await fs.promises.readFile(second.manifestPath, 'utf8'),
		);
		expect(
			await fs.promises
				.stat(
					path.join(
						root,
						first.workspaceId,
						'spotify-7f3b1d2c-1111-4aaa-8bbb-123456789012',
						'850000000000',
						'850000000000.xml',
					),
				)
				.then(() => true),
		).toBe(true);
	});

	it('rejects path traversal and protects active leases from cleanup', async () => {
		const workspace = await store.createWorkspace({
			distributionId: '11111111-1111-4111-8111-111111111111',
			attemptNo: 1,
			leaseMs: 60_000,
		});

		await expect(
			store.writeFile(workspace.id, '../outside.txt', 'nope'),
		).rejects.toThrow(/invalid package relative path|escapes workspace/);
		await expect(store.cleanup(workspace.id)).rejects.toThrow(
			/still leased/,
		);

		await store.releaseLease(workspace.id, 'FAILED');
		await expect(store.cleanup(workspace.id)).resolves.toBeUndefined();
	});

	it('removes an expired orphan workspace without touching a live lease', async () => {
		const workspace = await store.createWorkspace({
			distributionId: '22222222-2222-4222-8222-222222222222',
			attemptNo: 1,
			leaseMs: 60_000,
		});
		await store.releaseLease(workspace.id, 'FAILED');
		const old = new Date(Date.now() - 10_000);
		await fs.promises.utimes(workspace.rootPath, old, old);

		await expect(store.cleanupOrphans(0)).resolves.toEqual([workspace.id]);
		await expect(
			fs.promises.access(workspace.rootPath),
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('fails clearly when a declared track asset has no file id', async () => {
		const input = makeInput();
		(input.snapshot.payload.release as Record<string, unknown>).tracks = [
			{
				id: 'track-1',
				order: 1,
				title: 'Song',
				audio: { fileId: null, fileName: 'song.wav', fileSize: 10 },
			},
		];

		await expect(builder.build(input)).rejects.toThrow(/without fileId/);
	});
});

function makeInput(): BuildPackageInput {
	return {
		distributionId: '7f3b1d2c-1111-4aaa-8bbb-123456789012',
		snapshotId: '8f3b1d2c-1111-4aaa-8bbb-123456789012',
		attemptNo: 1,
		snapshot: {
			id: '8f3b1d2c-1111-4aaa-8bbb-123456789012',
			releaseId: '9f3b1d2c-1111-4aaa-8bbb-123456789012',
			contentHash: 'content-hash',
			trackOrderHash: 'order-hash',
			payload: {
				release: {
					id: '9f3b1d2c-1111-4aaa-8bbb-123456789012',
					tenantId: 'tenant-1',
					title: 'Release',
					version: null,
					upc: '850000000000',
					tracks: [
						{
							id: 'track-1',
							order: 1,
							title: 'Song',
							isrc: 'VNABC2600001',
							audio: {
								fileId: 'audio-1',
								fileName: 'song.wav',
								extension: 'wav',
								fileSize: 13,
							},
						},
					],
					coverArts: [],
					video: null,
				},
			},
		},
		identifiers: {},
		channels: [
			{
				id: 'channel-1',
				dspCode: 'SPOTIFY',
				route: 'DIRECT',
				aggregatorCode: null,
			},
		],
	};
}
