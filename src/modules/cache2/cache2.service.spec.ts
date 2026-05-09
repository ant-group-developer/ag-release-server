// cache/cache.service.spec.ts

import { Test } from '@nestjs/testing';
import { Cache2Service } from './cache2.service';

describe('Cache2Service', () => {
	let service: Cache2Service;

	const redisMock = {
		get: jest.fn(),
		set: jest.fn(),
		del: jest.fn(),
		scan: jest.fn(),
	};

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				Cache2Service,
				{
					provide: 'default_IORedisModuleConnectionToken',
					useValue: redisMock,
				},
			],
		}).compile();

		service = moduleRef.get(Cache2Service);

		jest.clearAllMocks();
	});

	describe('get', () => {
		it('should return parsed value when cache exists', async () => {
			redisMock.get.mockResolvedValue(JSON.stringify({ id: 1 }));

			const result = await service.get<{ id: number }>({
				key: 'release:detail:1',
			});

			expect(redisMock.get).toHaveBeenCalledWith('release:detail:1');
			expect(result).toEqual({ id: 1 });
		});

		it('should return null when cache does not exist', async () => {
			redisMock.get.mockResolvedValue(null);

			const result = await service.get({
				key: 'release:detail:1',
			});

			expect(result).toBeNull();
		});
	});

	describe('set', () => {
		it('should set value without ttl', async () => {
			await service.set({
				key: 'release:detail:1',
				value: { id: 1 },
			});

			expect(redisMock.set).toHaveBeenCalledWith(
				'release:detail:1',
				JSON.stringify({ id: 1 }),
			);
		});

		it('should set value with ttl', async () => {
			await service.set({
				key: 'release:detail:1',
				value: { id: 1 },
				ttl: 60,
			});

			expect(redisMock.set).toHaveBeenCalledWith(
				'release:detail:1',
				JSON.stringify({ id: 1 }),
				'EX',
				60,
			);
		});
	});

	describe('delete', () => {
		it('should delete cache by key', async () => {
			await service.delete({
				key: 'release:detail:1',
			});

			expect(redisMock.del).toHaveBeenCalledWith('release:detail:1');
		});
	});

	describe('deleteByPattern', () => {
		it('should delete all keys matched by pattern', async () => {
			redisMock.scan
				.mockResolvedValueOnce([
					'1',
					['release:detail:1', 'release:detail:2'],
				])
				.mockResolvedValueOnce(['0', ['release:detail:3']]);

			await service.deleteByPattern({
				pattern: 'release:detail:*',
			});

			expect(redisMock.scan).toHaveBeenCalledWith(
				'0',
				'MATCH',
				'release:detail:*',
				'COUNT',
				100,
			);

			expect(redisMock.scan).toHaveBeenCalledWith(
				'1',
				'MATCH',
				'release:detail:*',
				'COUNT',
				100,
			);

			expect(redisMock.del).toHaveBeenCalledWith(
				'release:detail:1',
				'release:detail:2',
			);

			expect(redisMock.del).toHaveBeenCalledWith('release:detail:3');
		});

		it('should not call del when no keys matched', async () => {
			redisMock.scan.mockResolvedValueOnce(['0', []]);

			await service.deleteByPattern({
				pattern: 'release:*',
			});

			expect(redisMock.del).not.toHaveBeenCalled();
		});
	});

	describe('wrap', () => {
		it('should return cached value if exists', async () => {
			redisMock.get.mockResolvedValue(JSON.stringify({ id: 1 }));

			const factory = jest.fn();

			const result = await service.wrap({
				key: 'release:detail:1',
				ttl: 60,
				factory,
			});

			expect(result).toEqual({ id: 1 });
			expect(factory).not.toHaveBeenCalled();
			expect(redisMock.set).not.toHaveBeenCalled();
		});

		it('should call factory and cache value when cache missed', async () => {
			redisMock.get.mockResolvedValue(null);

			const factory = jest.fn().mockResolvedValue({ id: 1 });

			const result = await service.wrap({
				key: 'release:detail:1',
				ttl: 60,
				factory,
			});

			expect(factory).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ id: 1 });

			expect(redisMock.set).toHaveBeenCalledWith(
				'release:detail:1',
				JSON.stringify({ id: 1 }),
				'EX',
				60,
			);
		});
	});
});
