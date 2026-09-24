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

const OWNERSHIP_SYNC_TABLE = `music_analytics.${CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC}`;

/**
 * Latest version of each ReplacingMergeTree key (isrc, effective_from, release_id).
 * GROUP BY matches ORDER BY so the aggregation can stream. FINAL cannot: after an
 * asset transfer writes many unmerged parts, FINAL merges the whole table in RAM
 * and ClickHouse kills it in AggregatingTransform (code 241, ~2.7 GiB server cap).
 * Tombstones stay out via argMax(is_deleted), so an older live version is not revived.
 */
function getVersionCollapsedOwnershipSql(): string {
	return `(SELECT
		    isrc,
		    release_id,
		    effective_from,
		    argMax(effective_to, updated_at) AS effective_to,
		    argMax(revenue_effective_from, updated_at) AS revenue_effective_from,
		    argMax(revenue_effective_to, updated_at) AS revenue_effective_to,
		    argMax(tenant_id, updated_at) AS tenant_id,
		    argMax(label_id, updated_at) AS label_id,
		    max(updated_at) AS updated_at
		  FROM ${OWNERSHIP_SYNC_TABLE}
		  GROUP BY isrc, effective_from, release_id
		  HAVING argMax(is_deleted, updated_at) = 0)`;
}

/**
 * Deduped ownership subquery.
 * One ISRC may belong to multiple releases sharing the same ownership window
 * (e.g. compilation / re-release). The sort key keeps one row per release_id,
 * not per window. An ISRC-scoped LEFT JOIN on window alone fans out each fact
 * row N times. Grouping by (isrc, window) and picking the latest updated_at
 * collapses those duplicates to one row.
 */
function getDedupedOwnershipSubquery(ownershipPeriod: OwnershipPeriod): string {
	const metrics = `argMax(tenant_id, updated_at) AS tenant_id,
		    argMax(label_id, updated_at) AS label_id,
		    argMax(release_id, updated_at) AS release_id`;
	const groupedBy =
		'isrc, effective_from, effective_to, revenue_effective_from, revenue_effective_to';
	if (ownershipPeriod === 'revenue') {
		return `(SELECT
		    isrc,
		    revenue_effective_from,
		    revenue_effective_to,
		    effective_from,
		    effective_to,
		    ${metrics}
		  FROM ${getVersionCollapsedOwnershipSql()}
		  GROUP BY ${groupedBy})`;
	}
	return `(SELECT
		    isrc,
		    effective_from,
		    effective_to,
		    revenue_effective_from,
		    revenue_effective_to,
		    ${metrics}
		  FROM ${getVersionCollapsedOwnershipSql()}
		  GROUP BY ${groupedBy})`;
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
	const predicate = getOwnershipDatePredicate(ownershipPeriod, factDateExpr);
	return `LEFT JOIN ${getDedupedOwnershipSubquery(ownershipPeriod)} AS o ON s.isrc = o.isrc AND s.isrc NOT IN ('', 'N/A', 'NA') AND ${predicate}`;
}

export function getOwnershipTenantExpr(): string {
	return "coalesce(nullIf(o.tenant_id, ''), t.tenant_id)";
}

/** Revenue-only attribution. Upload tenant is used only when no asset mapping exists. */
export function getRevenueTenantExpr(): string {
	return "coalesce(nullIf(o.tenant_id, ''), nullIf(t.tenant_id, ''), nullIf(s.ingest_tenant_id, ''))";
}

/** Revenue-only label attribution, matching getRevenueTenantExpr precedence. */
export function getRevenueLabelExpr(): string {
	return "coalesce(nullIf(o.label_id, ''), nullIf(t.label_id, ''), nullIf(s.ingest_label_id, ''))";
}

export function getOwnershipLedgerFallbackPredicate(): string {
	return `(o.isrc != '' OR s.isrc NOT IN (
		  SELECT isrc
		  FROM ${OWNERSHIP_SYNC_TABLE}
		  GROUP BY isrc, effective_from, release_id
		  HAVING argMax(is_deleted, updated_at) = 0
		))`;
}

export function buildPgTracksJoin(): string {
	return `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
}

/** For export-runner style joins where alias and table are assembled separately. */
export function getDedupedOwnershipSubquerySql(
	ownershipPeriod: OwnershipPeriod,
): string {
	return getDedupedOwnershipSubquery(ownershipPeriod);
}
