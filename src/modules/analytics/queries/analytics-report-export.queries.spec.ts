import { getRawDetailsPageQuery } from './analytics-report-export.queries';

describe('getRawDetailsPageQuery', () => {
	it('does not globally sort the aggregated detail rows', () => {
		const query = getRawDetailsPageQuery('s.dsp_id', '', '');

		expect(query).not.toMatch(/ORDER\s+BY/i);
	});
});
