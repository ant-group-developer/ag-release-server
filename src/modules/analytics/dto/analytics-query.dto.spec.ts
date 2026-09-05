import { validate } from 'class-validator';
import {
	ChartQueryDto,
	TimelineQueryDto,
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
