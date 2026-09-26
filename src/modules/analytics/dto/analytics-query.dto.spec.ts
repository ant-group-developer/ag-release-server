import { validate } from 'class-validator';
import {
	AnalyticsFilterSetDto,
	AnalyticsDspIdDto,
	ChartQueryDto,
	RevenueSeriesChartQueryDto,
	TimelineQueryDto,
	TrendSeriesChartQueryDto,
} from './analytics-query.dto';

describe('analytics query DTOs', () => {
	it('accept external artist IDs for revenue timeline endpoints', async () => {
		const query = new TimelineQueryDto();
		query.fromDate = '2026-01-01';
		query.toDate = '2026-01-31';
		query.artistId = 'kM_osncFah';

		expect(await validate(query)).toEqual([]);
	});

	it('accepts external artist and mapped DSP IDs for chart endpoints', async () => {
		const query = new ChartQueryDto();
		query.fromDate = '2026-01-01';
		query.toDate = '2026-01-31';
		query.artistId = 'kM_osncFah';
		query.pgDspId = 'spotify';

		expect(await validate(query)).toEqual([]);
	});
});
describe('trend-view line-chart granularity', () => {
	it('accepts granularity = day', async () => {
		const q = new ChartQueryDto();
		q.fromDate = '2026-01-01';
		q.toDate = '2026-01-31';
		q.granularity = 'day';
		expect(await validate(q)).toEqual([]);
	});

	it('accepts granularity = month', async () => {
		const q = new ChartQueryDto();
		q.fromDate = '2026-01-01';
		q.toDate = '2026-01-31';
		q.granularity = 'month';
		expect(await validate(q)).toEqual([]);
	});

	it('rejects granularity = MONTH (case-sensitive)', async () => {
		const q = new ChartQueryDto() as unknown as Record<string, unknown>;
		q.fromDate = '2026-01-01';
		q.toDate = '2026-01-31';
		q.granularity = 'MONTH';
		const errors = await validate(q as unknown as ChartQueryDto);
		expect(errors.some((e) => e.property === 'granularity')).toBe(true);
	});

	it('rejects granularity = week', async () => {
		const q = new ChartQueryDto() as unknown as Record<string, unknown>;
		q.fromDate = '2026-01-01';
		q.toDate = '2026-01-31';
		q.granularity = 'week';
		const errors = await validate(q as unknown as ChartQueryDto);
		expect(errors.some((e) => e.property === 'granularity')).toBe(true);
	});

	it('defaults granularity to day when omitted', () => {
		const q = new ChartQueryDto();
		expect(q.granularity).toBe('day');
	});
});

describe('array-based series chart DTOs', () => {
	it('accepts array filters and nested series options', async () => {
		const query = new TrendSeriesChartQueryDto();
		query.fromDate = '2026-01-01';
		query.toDate = '2026-01-31';
		query.filters = Object.assign(new AnalyticsFilterSetDto(), {
			tenantIds: ['11111111-1111-4111-8111-111111111111'],
			isrcs: ['USAAA2600001', 'USAAA2600002'],
		});
		query.seriesBy = 'isrc';
		expect(await validate(query)).toEqual([]);
	});

	it('allows canonical pg DSP or fallback raw report filters', async () => {
		const query = new TrendSeriesChartQueryDto();
		query.fromDate = '2026-01-01';
		query.toDate = '2026-01-31';
		query.filters = Object.assign(new AnalyticsFilterSetDto(), {
			dspIds: [
				Object.assign(new AnalyticsDspIdDto(), {
					pgDspId: 'spotify',
					dspReportIds: ['spotify-us'],
				}),
			],
		});

		expect(await validate(query)).toEqual([]);

		query.filters = Object.assign(new AnalyticsFilterSetDto(), {
			dspIds: [
				Object.assign(new AnalyticsDspIdDto(), {
					pgDspId: 'spotify',
				}),
			],
		});
		const errors = await validate(query);
		expect(errors).toEqual([]);

		query.filters = Object.assign(new AnalyticsFilterSetDto(), {
			dspIds: [new AnalyticsDspIdDto()],
		});
		const invalidErrors = await validate(query);
		expect(invalidErrors.some((error) => error.property === 'filters')).toBe(
			true,
		);
	});

	it('rejects scalar values in array filters and unknown series dimensions', async () => {
		const query = new RevenueSeriesChartQueryDto() as unknown as Record<
			string,
			unknown
		>;
		query.fromDate = '2026-01-01';
		query.toDate = '2026-01-31';
		query.filters = { isrcs: 'USAAA2600001' };
		query.seriesBy = 'track';
		const errors = await validate(
			query as unknown as RevenueSeriesChartQueryDto,
		);
		expect(errors.some((error) => error.property === 'filters')).toBe(true);
		expect(errors.some((error) => error.property === 'seriesBy')).toBe(
			true,
		);
	});
});
