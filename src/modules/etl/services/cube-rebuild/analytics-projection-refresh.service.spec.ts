import { Test } from '@nestjs/testing';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { AnalyticsProjectionRefreshService } from './analytics-projection-refresh.service';
import { CubeRebuildService } from './cube-rebuild.service';

describe('AnalyticsProjectionRefreshService', () => {
	let service: AnalyticsProjectionRefreshService;
	const cubeRebuildService = {
		pauseCubeMaterializedViews: jest.fn(),
		resumeCubeMaterializedViews: jest.fn(),
		rebuildSalesCubesForPeriods: jest.fn(),
		rebuildTrendsCubesForPeriods: jest.fn(),
	};
	const exchangeRateService = { syncMonthsForPeriods: jest.fn() };
	const redis = {
		incr: jest.fn(),
		decr: jest.fn(),
		del: jest.fn(),
		pexpire: jest.fn(),
		set: jest.fn(),
		eval: jest.fn(),
	};

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				AnalyticsProjectionRefreshService,
				{ provide: CubeRebuildService, useValue: cubeRebuildService },
				{ provide: ExchangeRateService, useValue: exchangeRateService },
				{
					provide: 'default_IORedisModuleConnectionToken',
					useValue: redis,
				},
			],
		}).compile();
		service = moduleRef.get(AnalyticsProjectionRefreshService);
		jest.clearAllMocks();
		cubeRebuildService.pauseCubeMaterializedViews.mockResolvedValue(
			undefined,
		);
		cubeRebuildService.resumeCubeMaterializedViews.mockResolvedValue(
			undefined,
		);
		redis.pexpire.mockResolvedValue(1);
		redis.del.mockResolvedValue(1);
	});

	it('pauses leftover cube views for the first nested fact import and resumes after the last', async () => {
		redis.incr
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(2);
		redis.decr
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(0);

		const order: string[] = [];
		await service.whileCubeViewsPaused(async () => {
			order.push('outer-start');
			await service.whileCubeViewsPaused(async () => {
				order.push('inner');
			});
			order.push('outer-end');
		});

		expect(order).toEqual(['outer-start', 'inner', 'outer-end']);
		expect(
			cubeRebuildService.pauseCubeMaterializedViews,
		).toHaveBeenCalledTimes(1);
		expect(
			cubeRebuildService.resumeCubeMaterializedViews,
		).toHaveBeenCalledTimes(1);
		expect(
			cubeRebuildService.pauseCubeMaterializedViews.mock
				.invocationCallOrder[0],
		).toBeLessThan(
			cubeRebuildService.resumeCubeMaterializedViews.mock
				.invocationCallOrder[0],
		);
	});

	it('still resumes cube views when the fact import throws', async () => {
		redis.incr.mockResolvedValue(1);
		redis.decr.mockResolvedValue(0);

		await expect(
			service.whileCubeViewsPaused(async () => {
				throw new Error('ftp failed');
			}),
		).rejects.toThrow('ftp failed');

		expect(
			cubeRebuildService.resumeCubeMaterializedViews,
		).toHaveBeenCalledTimes(1);
	});
});
