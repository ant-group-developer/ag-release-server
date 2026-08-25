import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';

/** Period column used to match fact date against the ownership window. */
export type OwnershipPeriod = 'trend' | 'revenue';

/**
 * Returns the ownership date predicate used in the LEFT JOIN ON clause.
 * Exported so services can build the ON condition from the dedup alias `o`.
 */
export function getOwnershipDatePredicate(
	ownershipPeriod: OwnershipPeriod,
	factDateExpr = ownershipPeriod === 'revenue'
		? 's.period'
		: 's.reporting_date',
): string {
	return ownershipPeriod === 'revenue'
		? `${factDateExpr} >= o.revenue_effective_from AND (o.revenue_effective_to IS NULL OR ${factDateExpr} < o.revenue_effective_to)`
		: `${factDateExpr} >= o.effective_from AND (o.effective_to IS NULL OR ${factDateExpr} < o.effective_to)`;
}

/**
 * Deduped ownership subquery.
 * One ISRC may belong to multiple releases sharing the same ownership window
 * (e.g. compilation / re-release).  The raw table has ORDER BY
 * (isrc, effective_from, release_id) so FINAL keeps one row per release_id,
 * not per window.  An ISRC-scoped LEFT JOIN on window alone fans out each
 * fact row N times.  Grouping by (isrc, window) and picking the latest
 * updated_at deterministically collapses those duplicates to one row.
 */
function getDedupedOwnershipSubquery(ownershipPeriod: OwnershipPeriod): string {
	if (ownershipPeriod === 'revenue') {
		return `(SELECT
		    isrc,
		    revenue_effective_from,
		    revenue_effective_to,
		    effective_from,
		    effective_to,
		    argMax(tenant_id, updated_at) AS tenant_id,
		    argMax(label_id, updated_at) AS label_id,
		    argMax(release_id, updated_at) AS release_id
		  FROM music_analytics.${CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC} FINAL
		  GROUP BY isrc, revenue_effective_from, revenue_effective_to, effective_from, effective_to)`;
	}
	return `(SELECT
		    isrc,
		    effective_from,
		    effective_to,
		    revenue_effective_from,
		    revenue_effective_to,
		    argMax(tenant_id, updated_at) AS tenant_id,
		    argMax(label_id, updated_at) AS label_id,
		    argMax(release_id, updated_at) AS release_id
		  FROM music_analytics.${CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC} FINAL
		  GROUP BY isrc, effective_from, effective_to, revenue_effective_from, revenue_effective_to)`;
}

/**
 * Builds the deduped LEFT JOIN clause for pg_asset_ownership_sync.
 * Usage:
 *   const ownershipJoin = buildOwnershipJoin('revenue');
 *   const joinSql = `INNER JOIN ... t ON s.isrc=t.isrc
 *                    ${ownershipJoin}`;
 */
export function buildOwnershipJoin(
	ownershipPeriod: OwnershipPeriod,
	factDateExpr?: string,
): string {
	const predicate = getOwnershipDatePredicate(
		ownershipPeriod,
		factDateExpr,
	);
	return `LEFT JOIN ${getDedupedOwnershipSubquery(ownershipPeriod)} AS o ON s.isrc = o.isrc AND ${predicate}`;
}

/** For export-runner style joins where alias and table are assembled separately. */
export function getDedupedOwnershipSubquerySql(
	ownershipPeriod: OwnershipPeriod,
): string {
	return getDedupedOwnershipSubquery(ownershipPeriod);
}
