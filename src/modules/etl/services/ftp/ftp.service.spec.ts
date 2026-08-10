import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as ftp from 'basic-ftp';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';
import { FtpAuthenticationError, FtpService, FtpSession } from './ftp.service';

jest.mock('basic-ftp');

/**
 * A stand-in for basic-ftp's Client. `closed` is a real getter on the library
 * client that flips to true after a timeout or connection error, and FtpSession
 * reads it to decide whether to reconnect, so the fake models it the same way.
 */
class FakeClient {
	access = jest.fn().mockResolvedValue(undefined);
	list = jest.fn().mockResolvedValue([]);
	downloadTo = jest.fn().mockResolvedValue(undefined);
	close = jest.fn(() => {
		this.isClosed = true;
	});
	ftp = { verbose: false };
	isClosed = false;

	get closed(): boolean {
		return this.isClosed;
	}
}

describe('FtpService', () => {
	let service: FtpService;
	let clients: FakeClient[];

	const configValues: Record<string, string> = {
		FTP_HOST: 'ftp.example.com',
		FTP_PORT: '21',
		FTP_USER: 'user',
		FTP_PASSWORD: 'secret',
		FTP_SECURE: 'true',
		FTP_BASE_PATH: '/root',
	};

	beforeEach(async () => {
		clients = [];
		(ftp.Client as unknown as jest.Mock).mockImplementation(() => {
			const client = new FakeClient();
			clients.push(client);
			return client;
		});

		const moduleRef = await Test.createTestingModule({
			providers: [
				FtpService,
				{
					provide: ConfigService,
					useValue: { get: (key: string) => configValues[key] },
				},
				{
					provide: ExcludePatternService,
					useValue: {
						shouldExclude: jest.fn().mockResolvedValue(false),
					},
				},
			],
		}).compile();

		service = moduleRef.get(FtpService);
		jest.clearAllMocks();
		clients = [];
	});

	describe('connect', () => {
		it('fails fast on 530 without retrying, so a throttled account is not hammered', async () => {
			(ftp.Client as unknown as jest.Mock).mockImplementationOnce(() => {
				const client = new FakeClient();
				client.access.mockRejectedValue(
					new Error('530 Login incorrect.'),
				);
				clients.push(client);
				return client;
			});

			await expect(service.connect()).rejects.toBeInstanceOf(
				FtpAuthenticationError,
			);
			expect(clients).toHaveLength(1);
			expect(clients[0].access).toHaveBeenCalledTimes(1);
		});

		it('retries a transient connection failure', async () => {
			let attempt = 0;
			(ftp.Client as unknown as jest.Mock).mockImplementation(() => {
				const client = new FakeClient();
				attempt += 1;
				if (attempt === 1) {
					client.access.mockRejectedValue(new Error('ECONNRESET'));
				}
				clients.push(client);
				return client;
			});

			await service.connect();

			expect(clients).toHaveLength(2);
		});
	});

	describe('FtpSession', () => {
		it('reuses one connection across calls', async () => {
			const session = service.createSession();

			const first = await session.getClient();
			const second = await session.getClient();

			expect(first).toBe(second);
			expect(clients).toHaveLength(1);
		});

		it('reconnects once the underlying client reports itself closed', async () => {
			const session = service.createSession();

			const first = (await session.getClient()) as unknown as FakeClient;
			first.isClosed = true;
			const second = await session.getClient();

			expect(second).not.toBe(first);
			expect(clients).toHaveLength(2);
		});

		it('closes at most once even when close is called repeatedly', async () => {
			const session = service.createSession();
			const client = (await session.getClient()) as unknown as FakeClient;

			session.close();
			session.close();

			expect(client.close).toHaveBeenCalledTimes(1);
		});

		it('refuses to hand out a client after being closed', async () => {
			const session = service.createSession();
			await session.getClient();
			session.close();

			await expect(session.getClient()).rejects.toThrow(
				'FtpSession is already closed',
			);
		});
	});

	describe('withSession', () => {
		it('closes the session even when the action throws', async () => {
			let leased: FtpSession | undefined;

			await expect(
				service.withSession(async (session) => {
					leased = session;
					await session.getClient();
					throw new Error('boom');
				}),
			).rejects.toThrow('boom');

			expect(clients[0].close).toHaveBeenCalledTimes(1);
			await expect(leased!.getClient()).rejects.toThrow(
				'FtpSession is already closed',
			);
		});
	});

	describe('listDspFolders', () => {
		it('spends one login per call when no session is supplied', async () => {
			await service.listDspFolders('trends', '202401');
			await service.listDspFolders('trends', '202402');

			expect(clients).toHaveLength(2);
			expect(clients[0].close).toHaveBeenCalledTimes(1);
			expect(clients[1].close).toHaveBeenCalledTimes(1);
		});

		it('spends one login for the whole session when one is supplied', async () => {
			const session = service.createSession();

			await service.listDspFolders('trends', '202401', session);
			await service.listDspFolders('usage', '202401', session);
			await service.listDspFolders('sales', '202401', session);

			expect(clients).toHaveLength(1);
			session.close();
		});

		it('reconnects and retries once when the socket died between calls', async () => {
			const session = service.createSession();
			const first = await session.getClient();
			(first.list as jest.Mock).mockRejectedValueOnce(
				new Error('control socket ended'),
			);

			const folders = await service.listDspFolders(
				'trends',
				'202401',
				session,
			);

			expect(clients).toHaveLength(2);
			expect(folders).toEqual([]);
		});

		it('swallows a non-disconnect failure and returns no folders', async () => {
			const session = service.createSession();
			const client = await session.getClient();
			(client.list as jest.Mock).mockRejectedValue(
				new Error('550 Not found'),
			);

			await expect(
				service.listDspFolders('trends', '202401', session),
			).resolves.toEqual([]);
			expect(clients).toHaveLength(1);
		});

		it('propagates a 530 rather than retrying it', async () => {
			const session = service.createSession();
			const client = await session.getClient();
			(client.list as jest.Mock).mockRejectedValue(
				new Error('530 Login incorrect.'),
			);

			await expect(
				service.listDspFolders('trends', '202401', session),
			).rejects.toThrow('530 Login incorrect.');
			expect(clients).toHaveLength(1);
		});
	});

	describe('listPeriods', () => {
		it('scans every category over a single login', async () => {
			await service.listPeriods();

			expect(clients).toHaveLength(1);
			expect(clients[0].list).toHaveBeenCalledTimes(4);
			expect(clients[0].close).toHaveBeenCalledTimes(1);
		});

		it('keeps only YYYYMM directories', async () => {
			const session = service.createSession();
			const client = await session.getClient();
			(client.list as jest.Mock).mockResolvedValue([
				{ name: '202401', isDirectory: true },
				{ name: 'archive', isDirectory: true },
				{ name: '202402', isDirectory: false },
			]);

			await expect(service.listPeriods(session)).resolves.toEqual([
				'202401',
			]);
		});
	});

	describe('discovery session reuse', () => {
		it('uses one login for every requested category', async () => {
			await service.listAllRemoteReportFiles(['trends', 'sales']);

			expect(clients).toHaveLength(1);
			expect(clients[0].list).toHaveBeenCalledTimes(2);
			expect(clients[0].close).toHaveBeenCalledTimes(1);
		});
	});
});
