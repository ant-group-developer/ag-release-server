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
