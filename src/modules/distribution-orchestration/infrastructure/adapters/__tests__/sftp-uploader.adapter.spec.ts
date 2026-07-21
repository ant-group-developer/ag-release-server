import * as fs from 'fs';
import * as path from 'path';

// Mock env-dependent modules before any import that touches them
jest.mock('src/utils/util.encrypt', () => ({
	encryptSecret: jest.fn(),
	decryptSecret: jest.fn(),
	decryptSecretSafe: jest.fn(),
}));
jest.mock('../../../../distribution/sftp-connect/sftp-connect.service');

import { DspRoutingConfigsService } from '../../../../distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from '../../../../distribution/sftp-connect/sftp-connect.service';
import { DspCode } from '../../../domain/value-objects/dsp-code.vo';
import { IdempotencyKey } from '../../../domain/value-objects/idempotency-key.vo';
import { PackagePath } from '../../../domain/value-objects/package-path.vo';
import { SftpUploaderAdapter } from '../sftp-uploader.adapter';

jest.mock('fs', () => {
	const actual = jest.requireActual<typeof import('fs')>('fs');
	return {
		...actual,
		existsSync: jest.fn(),
		writeFileSync: jest.fn(),
		promises: {
			...actual.promises,
			mkdtemp: jest.fn(),
			rm: jest.fn(),
		},
	};
});

const MOCK_SFTP_CONFIG = {
	host: 'sftp.example.com',
	port: 22,
	username: 'user',
	password: 'pass',
	path: '/uploads/ddex',
	type: 'sftp',
};

const MOCK_DELIVERY_CONFIG = {
	ernVersion: '4.3',
	sender: { partyId: 'PADPIDA2026', name: 'Test Sender' },
	recipient: { partyId: 'PADPIDA2027', name: 'Test Recipient' },
	sftp: MOCK_SFTP_CONFIG,
	createsDoneFolder: false,
	isCI: false,
};

describe('SftpUploaderAdapter', () => {
	let adapter: SftpUploaderAdapter;
	let sftpService: jest.Mocked<SftpConnectService>;
	let dspRoutingService: jest.Mocked<DspRoutingConfigsService>;

	beforeEach(() => {
		sftpService = {
			uploadFolder: jest.fn().mockResolvedValue(undefined),
			uploadFile: jest.fn().mockResolvedValue(undefined),
		} as any;

		dspRoutingService = {
			resolveFullDeliveryConfig: jest
				.fn()
				.mockResolvedValue(MOCK_DELIVERY_CONFIG),
		} as any;

		adapter = new SftpUploaderAdapter(sftpService, dspRoutingService);

		// Mock RELEASE_PARSED_DIR
		(adapter as any).baseDir = '/tmp/release_parsed';

		// Mock fs.existsSync
		(fs.existsSync as jest.Mock).mockReturnValue(true);
	});

	describe('upload', () => {
		it('resolves config and calls uploadFolder', async () => {
			const result = await adapter.upload({
				path: PackagePath.create(
					'local',
					'20260720120000123/0850080651804',
				),
				dspCode: DspCode.create('SPOTIFY'),
				key: IdempotencyKey.create('upload-key-1'),
			});

			expect(
				dspRoutingService.resolveFullDeliveryConfig,
			).toHaveBeenCalledWith('SPOTIFY');

			expect(sftpService.uploadFolder).toHaveBeenCalledWith({
				sftp: MOCK_SFTP_CONFIG,
				localDir: path.join('/tmp/release_parsed', '20260720120000123'),
				remoteDir: '/uploads/ddex',
			});

			expect(result).toEqual({ ok: true });
		});

		it('throws when local dir not found', async () => {
			(fs.existsSync as jest.Mock).mockReturnValue(false);

			await expect(
				adapter.upload({
					path: PackagePath.create('local', 'missing/dir'),
					dspCode: DspCode.create('SPOTIFY'),
					key: IdempotencyKey.create('upload-key-2'),
				}),
			).rejects.toThrow(/local dir not found/);
		});

		it('uses root "/" when sftp.path is empty', async () => {
			dspRoutingService.resolveFullDeliveryConfig.mockResolvedValue({
				...MOCK_DELIVERY_CONFIG,
				sftp: { ...MOCK_SFTP_CONFIG, path: '' },
			} as any);

			await adapter.upload({
				path: PackagePath.create('local', 'batch123/upc123'),
				dspCode: DspCode.create('VEVO'),
				key: IdempotencyKey.create('upload-key-3'),
			});

			expect(sftpService.uploadFolder).toHaveBeenCalledWith(
				expect.objectContaining({ remoteDir: '/' }),
			);
		});
	});

	describe('markBatchDone', () => {
		it('uploads .done file when createsDoneFolder=true', async () => {
			dspRoutingService.resolveFullDeliveryConfig.mockResolvedValue({
				...MOCK_DELIVERY_CONFIG,
				createsDoneFolder: true,
			} as any);

			// Configure pre-mocked fs functions
			(fs.promises.mkdtemp as jest.Mock).mockResolvedValue(
				'/tmp/done-12345678-abc',
			);
			(fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
			(fs.promises.rm as jest.Mock).mockResolvedValue(undefined);

			await adapter.markBatchDone({
				path: PackagePath.create(
					'local',
					'20260720120000123/0850080651804',
				),
				dspCode: DspCode.create('CI'),
				key: IdempotencyKey.create('done-key-1'),
			});

			expect(sftpService.uploadFile).toHaveBeenCalledWith({
				sftp: expect.objectContaining(MOCK_SFTP_CONFIG),
				localFile: expect.stringContaining(
					'BatchComplete_20260720120000123.done',
				),
				remoteDir: '/uploads/ddex',
			});
		});

		it('skips when createsDoneFolder=false', async () => {
			await adapter.markBatchDone({
				path: PackagePath.create('local', 'batch/upc'),
				dspCode: DspCode.create('SPOTIFY'),
				key: IdempotencyKey.create('done-key-2'),
			});

			expect(sftpService.uploadFile).not.toHaveBeenCalled();
		});
	});
});
