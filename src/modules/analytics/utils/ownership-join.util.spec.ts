import {
  buildOwnershipJoin,
  getDedupedOwnershipSubquerySql,
  getOwnershipDatePredicate,
  getOwnershipLedgerFallbackPredicate,
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
      expect(getOwnershipDatePredicate('revenue', 'r.event_date')).toContain(
        'r.event_date',
      );
    });
  });

  describe('getDedupedOwnershipSubquerySql', () => {
    it.each<['trend' | 'revenue']>([['trend'], ['revenue']])(
      'dedup query for %s contains argMax/GROUP BY and FINAL',
      (period) => {
        const sql = getDedupedOwnershipSubquerySql(period);
        expect(sql).toMatch(/argMax\s*\(/i);
        expect(sql).toMatch(/GROUP BY/i);
        expect(sql).toMatch(/FINAL/i);
        expect(sql).toContain('pg_asset_ownership_sync');
      },
    );

    it.each<['trend' | 'revenue']>([['trend'], ['revenue']])(
      'dedup query for %s filters out tombstoned rows (is_deleted = 0)',
      (period) => {
        const sql = getDedupedOwnershipSubquerySql(period);
        expect(sql).toContain('is_deleted = 0');
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
        expect(buildOwnershipJoin(period)).toContain('is_deleted = 0');
      },
    );
  });

  describe('getOwnershipLedgerFallbackPredicate', () => {
    it('filters out tombstoned rows', () => {
      expect(getOwnershipLedgerFallbackPredicate()).toContain('is_deleted = 0');
    });
  });
});
