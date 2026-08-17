import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import * as ftp from 'basic-ftp';
import { decryptSecret, encryptSecret } from 'src/utils/util.encrypt';
import { EntityManager, Repository } from 'typeorm';
import { FtpProviderConfig } from '../entities/ftp-provider-config.entity';
import { FtpProviderConfigQueryService } from './ftp-provider-config.query.service';
import { FtpProviderConfigService } from './ftp-provider-config.service';

jest.mock('basic-ftp');

class FakeClient {
	access = jest.fn().mockResolvedValue(undefined);
	close = jest.fn();
	ftp = { verbose: false };
}

describe('FtpProviderConfigService', () => {
	let service: FtpProviderConfigService;
	let repo: Partial<Repository<FtpProviderConfig>> & {
		findOne: jest.Mock;
		create: jest.Mock;
		delete: jest.Mock;
	};
	let manager: { save: jest.Mock; getRepository: jest.Mock };
	let dataSource: { transaction: jest.Mock };

	const baseEntity = (
		overrides: Partial<FtpProviderConfig> = {},
	): FtpProviderConfig =>
		({
			id: 'id-1',
			code: 'merlin',
			name: 'Merlin',
			host: 'ftp.merlin.example.com',
			port: 21,
			username: 'user',
			passwordEncrypted: encryptSecret('secret'),
			secure: 'explicit',
			basePath: '/root',
			isActive: false,
			description: null,
			...overrides,
		}) as FtpProviderConfig;

	beforeEach(async () => {
		(ftp.Client as unknown as jest.Mock).mockImplementation(
			() => new FakeClient(),
		);

		const mergedRepo = {
			findOne: jest.fn(),
			create: jest.fn((data) => data),
			delete: jest.fn(),
			update: jest.fn(),
			merge: jest.fn((entity, patch) => Object.assign(entity, patch)),
			save: jest.fn(async (entity) => entity),
		};

		manager = {
			save: jest.fn(async (_entity, data) => data),
			getRepository: jest.fn(() => mergedRepo),
		};

		dataSource = {
			transaction: jest.fn(async (cb) => cb(manager as unknown as EntityManager)),
		};

		repo = mergedRepo as any;

		const moduleRef = await Test.createTestingModule({
			providers: [
				FtpProviderConfigService,
				{ provide: getRepositoryToken(FtpProviderConfig), useValue: repo },
				{ provide: getDataSourceToken(), useValue: dataSource },
				{
					provide: FtpProviderConfigQueryService,
					useValue: { getList: jest.fn() },
				},
			],
		}).compile();

		service = moduleRef.get(FtpProviderConfigService);
		jest.clearAllMocks();
		(ftp.Client as unknown as jest.Mock).mockImplementation(
			() => new FakeClient(),
		);
	});

	describe('getActiveConfig', () => {
		it('decrypts the password and maps secure to a boolean', async () => {
			repo.findOne.mockResolvedValue(baseEntity({ isActive: true }));

			const config = await service.getActiveConfig();

			expect(config).toEqual({
				host: 'ftp.merlin.example.com',
				port: 21,
				user: 'user',
				password: 'secret',
				secure: true,
				basePath: '/root',
			});
		});

		it('caches the result so a second call within the TTL skips the DB', async () => {
			repo.findOne.mockResolvedValue(baseEntity({ isActive: true }));

			await service.getActiveConfig();
			await service.getActiveConfig();

			expect(repo.findOne).toHaveBeenCalledTimes(1);
		});

		it('throws a clear error when no config is active', async () => {
			repo.findOne.mockResolvedValue(null);

			await expect(service.getActiveConfig()).rejects.toMatchObject({
				response: expect.objectContaining({
					messageCode: 'ftpProviderConfig.message.error.noActiveConfig',
				}),
			});
		});
	});

	describe('create', () => {
		it('encrypts the password before saving', async () => {
			repo.findOne.mockResolvedValue(null);

			await service.create({
				code: 'merlin',
				name: 'Merlin',
				host: 'ftp.merlin.example.com',
				username: 'user',
				password: 'plain-secret',
			} as any);

			const saveCall = manager.save.mock.calls[0];
			expect(saveCall[1].passwordEncrypted).not.toBe('plain-secret');
			expect(decryptSecret(saveCall[1].passwordEncrypted)).toBe(
				'plain-secret',
			);
		});

		it('rejects a duplicate code', async () => {
			repo.findOne.mockResolvedValue(baseEntity());

			await expect(
				service.create({
					code: 'merlin',
					name: 'Merlin',
					host: 'h',
					username: 'u',
					password: 'p',
				} as any),
			).rejects.toMatchObject({
				response: expect.objectContaining({
					messageCode: 'ftpProviderConfig.message.error.codeExists',
				}),
			});
		});

		it('invalidates the active-config cache after creating an active row', async () => {
			repo.findOne
				.mockResolvedValueOnce(null) // code uniqueness check in create()
				.mockResolvedValueOnce(baseEntity({ isActive: true })); // getActiveConfig() after invalidation

			await service.create({
				code: 'merlin',
				name: 'Merlin',
				host: 'h',
				username: 'u',
				password: 'p',
				isActive: true,
			} as any);

			await service.getActiveConfig();
			expect(repo.findOne).toHaveBeenCalledTimes(2);
		});
	});

	describe('update', () => {
		it('switching isActive:true deactivates other rows within the same transaction', async () => {
			repo.findOne.mockResolvedValue(baseEntity());
			const innerRepo = manager.getRepository();

			await service.update('id-1', { isActive: true } as any);

			expect(innerRepo.update).toHaveBeenCalledWith(
				{ isActive: true },
				{ isActive: false },
			);
			expect(innerRepo.update).toHaveBeenCalledWith('id-1', {
				isActive: true,
			});
		});

		it('throws NOT_FOUND for a missing id', async () => {
			repo.findOne.mockResolvedValue(null);

			await expect(
				service.update('missing', { name: 'x' } as any),
			).rejects.toMatchObject({
				response: expect.objectContaining({
					messageCode: 'ftpProviderConfig.message.error.notFound',
				}),
			});
		});
	});

	describe('remove', () => {
		it('blocks deleting the active config', async () => {
			repo.findOne.mockResolvedValue(baseEntity({ isActive: true }));

			await expect(service.remove('id-1')).rejects.toMatchObject({
				response: expect.objectContaining({
					messageCode: 'ftpProviderConfig.message.error.cannotDeleteActive',
				}),
			});
			expect(repo.delete).not.toHaveBeenCalled();
		});

		it('deletes an inactive config', async () => {
			repo.findOne.mockResolvedValue(baseEntity({ isActive: false }));

			await service.remove('id-1');

			expect(repo.delete).toHaveBeenCalledWith({ id: 'id-1' });
		});
	});

	describe('testConnect', () => {
		it('returns ok:true on a successful connection', async () => {
			const result = await service.testConnect({
				host: 'h',
				username: 'u',
				password: 'p',
			} as any);

			expect(result).toEqual({ ok: true });
		});

		it('returns ok:false with the error message on failure', async () => {
			(ftp.Client as unknown as jest.Mock).mockImplementationOnce(() => {
				const client = new FakeClient();
				client.access.mockRejectedValue(new Error('530 Login incorrect.'));
				return client;
			});

			const result = await service.testConnect({
				host: 'h',
				username: 'u',
				password: 'wrong',
			} as any);

			expect(result.ok).toBe(false);
			expect(result.error).toContain('530');
		});
	});
});
