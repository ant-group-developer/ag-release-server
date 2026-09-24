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
		expect(sql).toContain("metadata['sub_type'] = 'devices'");
		expect(sql).toContain("toUInt64OrZero(metadata['views'])");
		expect(sql).toContain("toYYYYMM(reporting_period) = '202608'");
	});

	it('truncates the demographics cube during a full trends rebuild', async () => {
		clickHouseService.query.mockResolvedValue([{ period: '2026-08' }]);

		await service.rebuildAllTrendsCubes();

		expect(clickHouseService.execute).toHaveBeenCalledWith(
			'TRUNCATE TABLE IF EXISTS music_analytics.trends_demographics_cube',
		);
	});

	it('drops and rebuilds the statement-currency cube for each sales partition', async () => {
		await service.rebuildSalesCubesForPeriods(['2026-08']);

		const sql = clickHouseService.execute.mock.calls
			.map((call) => call[0] as string)
			.join('\n');
		expect(sql).toContain(
			"ALTER TABLE music_analytics.sales_statement_monthly_cube DROP PARTITION '202608'",
		);
		expect(sql).toContain(
			'INSERT INTO music_analytics.sales_statement_monthly_cube',
		);
		expect(sql).toContain(
			"if(f.revenue_currency = '', 'USD', f.revenue_currency) AS revenue_currency",
		);
		expect(sql).toContain('f.revenue_local != 0 OR f.revenue_usd = 0');
		expect(sql).toContain(
			'f.ingest_tenant_id, f.ingest_label_id, revenue_currency',
		);
	});

	it('includes and counts the statement-currency cube in a full sales rebuild', async () => {
		clickHouseService.query
			.mockResolvedValueOnce([{ cnt: '11' }])
			.mockResolvedValueOnce([{ cnt: '12' }])
			.mockResolvedValueOnce([{ cnt: '13' }])
			.mockResolvedValueOnce([{ cnt: '14' }]);

		await expect(service.rebuildAllSalesCubes()).resolves.toEqual({
			dspRows: 11,
			terRows: 12,
			exportRows: 13,
			statementRows: 14,
		});

		expect(clickHouseService.execute).toHaveBeenCalledWith(
			'TRUNCATE TABLE IF EXISTS music_analytics.sales_statement_monthly_cube',
		);
		const sql = clickHouseService.execute.mock.calls
			.map((call) => call[0] as string)
			.join('\n');
		expect(sql).toContain(
			'INSERT INTO music_analytics.sales_statement_monthly_cube',
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
		clickHouseService.query.mockResolvedValue([
			{ table: 'sales_dsp_monthly_cube_v2_mv' },
		]);

		await service.resumeCubeMaterializedViews();

		expect(clickHouseService.execute).toHaveBeenCalledWith(
			'ATTACH TABLE IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv',
		);
	});

	it('does not try to attach cube views that were dropped by migration 050', async () => {
		await service.resumeCubeMaterializedViews();

		expect(clickHouseService.execute).not.toHaveBeenCalled();
	});

	it('keeps going when a dropped cube view cannot be attached', async () => {
		clickHouseService.query.mockResolvedValue([
			{ table: 'sales_dsp_monthly_cube_v2_mv' },
		]);
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
