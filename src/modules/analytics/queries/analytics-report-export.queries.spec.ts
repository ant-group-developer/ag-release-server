import {
	getRawDetailsPageQuery,
	getRawStatementDetailsPageQuery,
} from './analytics-report-export.queries';

describe('getRawDetailsPageQuery', () => {
	it('does not globally sort the aggregated detail rows', () => {
		const query = getRawDetailsPageQuery('s.dsp_id', '', '');

		expect(query).not.toMatch(/ORDER\s+BY/i);
	});
});

describe('getRawStatementDetailsPageQuery', () => {
	it('reads imported local amount and keeps currency as an aggregation dimension', () => {
		const query = getRawStatementDetailsPageQuery('s.dsp_id', '', '');

		expect(query).toContain('FROM sales_statement_monthly_cube s');
		expect(query).toContain(
			'toString(sum(s.revenue_local)) AS revenue_amount',
		);
		expect(query).toContain('s.revenue_currency AS currency');
		expect(query).toContain('isrc, s.revenue_currency');
		expect(query).not.toMatch(/ORDER\s+BY/i);
	});
});
