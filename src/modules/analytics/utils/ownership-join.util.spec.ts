import {
	buildOwnershipJoin,
	getDedupedOwnershipSubquerySql,
	getOwnershipDatePredicate,
	getOwnershipLedgerFallbackPredicate,
	getRevenueLabelExpr,
	getRevenueTenantExpr,
} from './ownership-join.util';

describe('ownership-join.util', () => {
	describe('getOwnershipDatePredicate', () => {
		it('returns trend predicate against s.reporting_date by default', () => {
			const p = getOwnershipDatePredicate('trend');
			expect(p).toContain('o.effective_from');
			expect(p).toContain('s.reporting_date');
			expect(p).not.toContain('revenue_effective');
		});

		it('returns revenue predicate against s.period by default', () => {
			const p = getOwnershipDatePredicate('revenue');
			expect(p).toContain('o.revenue_effective_from');
			expect(p).toContain('s.period');
		});

		it('honours explicit factDateExpr override', () => {
			expect(getOwnershipDatePredicate('trend', 's.period')).toContain(
				's.period',
			);
			expect(
				getOwnershipDatePredicate('revenue', 'r.event_date'),
			).toContain('r.event_date');
		});
	});

	describe('getDedupedOwnershipSubquerySql', () => {
		it.each<['trend' | 'revenue']>([['trend'], ['revenue']])(
			'dedup query for %s collapses versions by sort key, then by window',
			(period) => {
				const sql = getDedupedOwnershipSubquerySql(period);
				expect(sql).toMatch(/argMax\s*\(/i);
				expect(sql).toMatch(
					/GROUP BY isrc, effective_from, release_id/i,
				);
				expect(sql).toContain('max(updated_at) AS version_updated_at');
				expect(sql).not.toContain('max(updated_at) AS updated_at');
				expect(sql).toContain('argMax(tenant_id, version_updated_at)');
				expect(sql).toMatch(
					/GROUP BY isrc, effective_from, effective_to, revenue_effective_from, revenue_effective_to/i,
				);
				expect(sql).not.toMatch(/FINAL/i);
				expect(sql).toContain('pg_asset_ownership_sync');
			},
		);

		it.each<['trend' | 'revenue']>([['trend'], ['revenue']])(
			'dedup query for %s drops tombstones without reviving an older version',
			(period) => {
				const sql = getDedupedOwnershipSubquerySql(period);
				expect(sql).toContain('argMax(is_deleted, updated_at) = 0');
			},
		);
	});

	describe('buildOwnershipJoin', () => {
		it('returns a LEFT JOIN with deduped subquery and correct alias', () => {
			const j = buildOwnershipJoin('revenue');
			expect(j).toMatch(/LEFT JOIN/i);
			expect(j).toContain('AS o ON');
			expect(j).toContain('s.isrc = o.isrc');
			expect(j).toContain('o.revenue_effective_from');
			expect(j).not.toMatch(/LEFT JOIN\s*\(\s*SELECT\s+\*\s+FROM/i);
		});

		it('uses far-future sentinel for open-ended window (IS NULL branch)', () => {
			const j = buildOwnershipJoin('trend');
			expect(j).toContain('IS NULL');
			expect(j).toContain('o.effective_to');
		});

		it('uses dedup subquery (explicit column list), not raw SELECT *', () => {
			for (const period of ['trend', 'revenue'] as const) {
				const j = buildOwnershipJoin(period);
				// The fanout-prone pattern: LEFT JOIN (SELECT * FROM ... FINAL) AS o
				// — the dedup version always starts with an explicit column list.
				expect(j).toMatch(/LEFT JOIN\s*\(\s*SELECT\s+isrc/i);
				expect(j).not.toMatch(/LEFT JOIN\s*\(\s*SELECT\s+\*/i);
				// And no ANY JOIN — we use deterministic argMax dedup instead.
				expect(j).not.toMatch(/ANY JOIN/i);
			}
		});

		it.each<['trend' | 'revenue']>([['trend'], ['revenue']])(
			'LEFT JOIN for %s filters out tombstoned rows',
			(period) => {
				expect(buildOwnershipJoin(period)).toContain(
					'argMax(is_deleted, updated_at) = 0',
				);
				expect(buildOwnershipJoin(period)).not.toMatch(/FINAL/i);
			},
		);
	});

	describe('getOwnershipLedgerFallbackPredicate', () => {
		it('drops tombstones by the sort key instead of FINAL on the whole table', () => {
			const sql = getOwnershipLedgerFallbackPredicate();
			expect(sql).toContain('argMax(is_deleted, updated_at) = 0');
			expect(sql).toMatch(/GROUP BY isrc, effective_from, release_id/i);
			expect(sql).not.toMatch(/FINAL/i);
		});
	});

	describe('revenue ingest attribution', () => {
		it('uses ownership, then track, then upload tenant', () => {
			expect(getRevenueTenantExpr()).toBe(
				"coalesce(nullIf(o.tenant_id, ''), nullIf(t.tenant_id, ''), nullIf(s.ingest_tenant_id, ''))",
			);
		});

		it('uses ownership, then track, then upload label', () => {
			expect(getRevenueLabelExpr()).toBe(
				"coalesce(nullIf(o.label_id, ''), nullIf(t.label_id, ''), nullIf(s.ingest_label_id, ''))",
			);
		});

		it('does not match placeholder ISRCs to ownership', () => {
			expect(buildOwnershipJoin('revenue')).toContain(
				"s.isrc NOT IN ('', 'N/A', 'NA')",
			);
		});
	});
});
