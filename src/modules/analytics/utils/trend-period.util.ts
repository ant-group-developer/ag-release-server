export type TrendChartGranularity = 'day' | 'month';

/**
 * SQL expressions for bucketing trend-view daily-cube rows.
 *
 * Both granularities query the daily cube with the same
 * `s.reporting_date BETWEEN {from} AND {to}` predicate — granularity only
 * changes the SELECT/GROUP BY/ORDER BY expression, so a month bucket covers
 * exactly the days that fall inside the requested range (e.g. a range
 * 2026-01-25..2026-03-15 produces buckets 2026-01-01 with 7 days of data,
 * 2026-02-01 with the full month, and 2026-03-01 with 15 days of data).
 */
export function getTrendPeriodExprs(
	granularity: TrendChartGranularity | undefined = 'day',
): { periodExpr: string; groupExpr: string } {
	if (granularity === 'month') {
		return {
			periodExpr:
				"formatDateTime(toStartOfMonth(s.reporting_date), '%Y-%m-%d')",
			groupExpr: 'toStartOfMonth(s.reporting_date)',
		};
	}
	return {
		periodExpr: "formatDateTime(s.reporting_date, '%Y-%m-%d')",
		groupExpr: 's.reporting_date',
	};
}
