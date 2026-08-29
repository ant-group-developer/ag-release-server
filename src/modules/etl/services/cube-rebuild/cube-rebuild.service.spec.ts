import { Test } from '@nestjs/testing';
import { ClickHouseService } from '../../../clickhouse';
import { CubeRebuildService } from './cube-rebuild.service';

describe('CubeRebuildService', () => {
	let service: CubeRebuildService;
	const clickHouseService = {
		execute: jest.fn(),
		query: jest.fn(),
	};

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				CubeRebuildService,
				{ provide: ClickHouseService, useValue: clickHouseService },
			],
		}).compile();
		service = moduleRef.get(CubeRebuildService);
		jest.clearAllMocks();
		clickHouseService.execute.mockResolvedValue(undefined);
		clickHouseService.query.mockResolvedValue([]);
	});

	it('drops and rebuilds the demographics cube with the other trends cubes', async () => {
		await service.rebuildTrendsCubesForPeriods(['2026-08']);

		const sql = clickHouseService.execute.mock.calls
			.map((call) => call[0] as string)
			.join('\n');
		expect(sql).toContain(
			"ALTER TABLE music_analytics.trends_demographics_cube DROP PARTITION '202608'",
		);
		expect(sql).toContain(
			'INSERT INTO music_analytics.trends_demographics_cube',
		);
		expect(sql).toContain("usage_type = 'view_demo'");
		expect(sql).toContain("usage_type = 'view_social'");
		expect(sql).toContain("toYYYYMM(reporting_period) = '202608'");
	});

	it('truncates the demographics cube during a full trends rebuild', async () => {
		clickHouseService.query.mockResolvedValue([{ period: '2026-08' }]);

		await service.rebuildAllTrendsCubes();

		expect(clickHouseService.execute).toHaveBeenCalledWith(
			'TRUNCATE TABLE IF EXISTS music_analytics.trends_demographics_cube',
		);
	});

	it('detaches leftover cube materialized views before a period fact write', async () => {
		await service.pauseCubeMaterializedViews();

		const sql = clickHouseService.execute.mock.calls
			.map((call) => call[0] as string)
			.join('\n');
		expect(sql).toContain(
			'DETACH TABLE IF EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv',
		);
		expect(sql).toContain(
			'DETACH TABLE IF EXISTS music_analytics.trends_demographics_cube_mv',
		);
	});

	it('reattaches leftover cube materialized views after the rebuild', async () => {
		await service.resumeCubeMaterializedViews();

		expect(clickHouseService.execute).toHaveBeenCalledWith(
			'ATTACH TABLE IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv',
		);
	});

	it('keeps going when a dropped cube view cannot be attached', async () => {
		clickHouseService.execute.mockRejectedValueOnce(
			new Error(
				"Table music_analytics.sales_dsp_monthly_cube_v2_mv doesn't exist",
			),
		);

		await expect(
			service.resumeCubeMaterializedViews(),
		).resolves.toBeUndefined();
	});
});
