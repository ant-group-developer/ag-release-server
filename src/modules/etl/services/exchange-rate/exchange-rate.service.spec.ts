import { ExchangeRateService } from './exchange-rate.service';

describe('ExchangeRateService.backfillMissingCurrencies', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		jest.restoreAllMocks();
	});

	it('inserts only missing reporting currencies and does not rebuild cubes', async () => {
		const query = jest.fn(async (sql: string) => {
			if (sql.includes('currency IN')) {
				return [
					{ rate_month: '2024-01', currency: 'CNY' },
					{ rate_month: '2024-01', currency: 'EUR' },
					{ rate_month: '2024-01', currency: 'GBP' },
					{ rate_month: '2024-01', currency: 'INR' },
					{ rate_month: '2024-02', currency: 'CNY' },
					{ rate_month: '2024-02', currency: 'EUR' },
					{ rate_month: '2024-02', currency: 'GBP' },
					{ rate_month: '2024-02', currency: 'INR' },
					{ rate_month: '2024-02', currency: 'VND' },
				];
			}
			return [{ rate_month: '2024-01' }, { rate_month: '2024-02' }];
		});
		const insert = jest.fn().mockResolvedValue(undefined);
		const rebuildAllSalesCubes = jest.fn();
		const service = new ExchangeRateService(
			{ query, insert } as never,
			{
				rebuildAllSalesCubes,
				rebuildAllTrendsCubes: jest.fn(),
			} as never,
		);
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => [
				{ date: '2024-01-31', base: 'USD', quote: 'EUR', rate: 0.92 },
				{ date: '2024-01-31', base: 'USD', quote: 'VND', rate: 25434 },
			],
		}) as typeof fetch;

		const result = await service.backfillMissingCurrencies();

		expect(result).toEqual({
			monthsChecked: 2,
			inserted: 1,
			stillMissing: [],
		});
		expect(global.fetch).toHaveBeenCalledTimes(1);
		const url = String(
			(global.fetch as unknown as jest.Mock).mock.calls[0][0],
		);
		expect(url).toContain('base=USD');
		expect(url).toContain('date=2024-01-31');
		expect(url).toContain('quotes=VND');
		expect(url).not.toContain('EUR');
		expect(insert).toHaveBeenCalledWith('exchange_rates', [
			expect.objectContaining({
				rate_month: '2024-01',
				currency: 'VND',
				usd_to_local_rate: '25434',
				is_provisional: 0,
			}),
		]);
		expect(rebuildAllSalesCubes).not.toHaveBeenCalled();
		expect(query.mock.calls.map((call) => call[0]).join('\n')).not.toMatch(
			/TRUNCATE|sales_export_monthly_cube|sales_dsp_monthly|sales_statement_monthly/i,
		);
	});
});
