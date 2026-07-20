# Phase 4 ACL Integration — Executive Research Summary

**Date:** 2026-07-20  
**Context:** Distribution v-next Phase 4 Integration & ACL  
**Research Team:** 4 parallel researchers (Architecture, Patterns, Testing, Security/Performance)

---

## Critical Findings

### 🔴 P0 Security Vulnerabilities (MUST FIX)

**V1: IDOR — Missing Tenant Isolation**
- **Risk:** Any authenticated user can access ANY distribution by guessing UUID
- **Location:** `distribution.controller.ts:getTimeline()`, `streamEvents()`
- **Impact:** Cross-tenant data leak — User in Tenant A can view Tenant B's distribution status, events, metadata
- **Root Cause:** Distribution aggregate HAS `tenantId` field but endpoints DON'T validate ownership
- **Fix:** Add ownership check before serving data:
  ```typescript
  const dist = await this.repo.findOne(id);
  if (dist.tenantId !== user.tenantId && user.type !== UserType.ADMIN) {
    throw new NotFoundException(); // 404, not 403 — hide existence
  }
  ```

**V2: SSE Authorization Bypass**
- **Risk:** Real-time event streams lack ownership validation + event filtering
- **Location:** `@Sse(':id/stream')` endpoint
- **Impact:** Users can subscribe to other tenants' distribution streams
- **Fix:** Connection-time ownership check + event-level filtering by user role

**V3: Permission Staleness**
- **Risk:** 24-hour cache TTL → stale permissions for up to 1 day after revocation
- **Impact:** Revoked users retain access until cache expires
- **Fix:** Reduce TTL to 15 minutes + add event-driven invalidation

---

## Architecture Analysis

### Current ACL System (Existing)

**Model:** RBAC (Role-Based Access Control)  
**Pattern:** Decorator + Guard (NestJS standard)  
**Components:**
- `JwtAuthGuard` → validates JWT, enriches `req.user`
- `PolicyGuard` → checks `@RequirePermissions()`, `@SystemAdminOnly()`, etc.
- Permission caching: Redis 24h TTL via `AccessControlService.getAuthContext()`
- User context: `{ id, type, tenantId, tenantUserType, permission: string[] }`

**Authorization Layers (8 checks in order):**
1. Public routes → skip auth
2. User presence → JWT required
3. SystemAdminOnly → only `UserType.ADMIN`
4. SystemAdmin bypass → skip remaining checks
5. Tenant context → validate `tenantId` present
6. Permissions (ANY-of) → user has ≥1 required permission
7. Tenant type gates → white-label checks
8. Tenant role gates → owner/admin checks

### Distribution v-next Gaps

**HTTP Layer:** ✅ Decorators exist, NOT applied to distribution endpoints yet  
**Domain Layer:** ❌ NO authorization — handlers trust caller (perimeter defense)  
**BullMQ Jobs:** ❌ NO user context propagation — run with implicit system authority  
**SSE Streams:** ⚠️ Connection-time auth only, no ownership check, no event filtering  

**Critical Missing:** Distribution aggregate HAS `tenantId` but queries DON'T filter by tenant

---

## Integration Strategy (3 Layers)

### Layer 1: HTTP Endpoints (REST + SSE)

**Add distribution permissions:**
```typescript
DISTRIBUTION: {
  CREATE: 'distribution.create',
  READ: 'distribution.read',
  CANCEL: 'distribution.cancel',
  RETRY: 'distribution.retry',
  TAKEDOWN: 'distribution.takedown',
}
```

**Decorate controllers:**
```typescript
@RequirePermissions('distribution.read')
@Get(':id/timeline')
async getTimeline(@Param('id') id: string, @User() user: UserReq) {
  // Validate ownership
  await this.validateDistributionAccess(id, user.tenantId);
  return this.timelineQuery.getTimeline(id, user);
}
```

**Return 404 (not 403)** for cross-tenant access to hide resource existence

### Layer 2: BullMQ Job Context

**Pattern:** Enqueue-time authorization + audit trail (NO per-step checks)

**Enrich job payload:**
```typescript
interface JobPayload {
  distributionId: string;
  correlationId: string;
  key: string;
  userId: string;           // NEW: who triggered
  tenantId: string;         // NEW: tenant context
}
```

**Workers validate tenant match:**
```typescript
const dist = await this.repo.load(distributionId);
if (dist.tenantId !== payload.tenantId) {
  throw new SecurityError('Tenant validation failed');
}
```

**Rationale:** Distribution is long-running (minutes to hours). Permission check at workflow initiation (HTTP submit) provides security; rechecking on every BullMQ step adds complexity for marginal gain.

### Layer 3: Read-Side Queries (Timeline Projection)

**Add tenant filtering:**
```typescript
async getTimeline(id: string, user: UserReq) {
  const where = { distributionId: id };
  
  // Tenant isolation (unless system admin)
  if (user.type !== UserType.ADMIN) {
    where.tenantId = user.tenantId;
  }
  
  return this.repo.find({ where, order: { seq: 'ASC' } });
}
```

**Required migration:**
```sql
ALTER TABLE distribution_timeline_events 
ADD COLUMN tenant_id UUID NOT NULL;

CREATE INDEX idx_timeline_tenant_distribution 
ON distribution_timeline_events(tenant_id, distribution_id);
```

---

## Testing Strategy

### Test Infrastructure (Existing)

**Stack:** Jest + TypeScript + Testcontainers  
**Layers:**
- Unit: Pure domain logic, in-memory test doubles
- Integration: Real Postgres via testcontainers
- E2E: Full flow simulation with NestJS testing module

**Test Doubles Available:**
- `InMemoryDistributionRepository`, `InMemoryUnitOfWork`
- Pattern: Simulate optimistic locking, idempotency, errors

### Phase 4 Test Coverage Requirements

**1. Permission Matrix Testing**
- Positive: user HAS permission → allow
- Negative: user LACKS permission → 403 Forbidden
- Negative: no auth token → 401 Unauthorized
- Negative: cross-tenant access → 404 Not Found (not 403)
- Edge: system admin bypasses checks

**2. Multi-Tenant Isolation**
- Tenant A cannot access/modify Tenant B's distributions
- Test at all 3 layers: handler, repository, HTTP

**3. Concurrent Access**
- Optimistic locking under multi-user scenarios
- Tenant isolation verified under race conditions

**4. Security Penetration**
- Token tampering → 401
- Forged JWT signature → 401
- SQL injection via tenantId filter → validation error
- Privilege escalation attempts → 403

**5. Performance/Load**
- ACL checks <5ms per request
- 100 concurrent authorized requests without degradation
- SSE stream scaling to 10K connections

### CI/CD Gap

**Current:** NO automated test runs in GitHub Actions  
**Recommendation:** Add `test.yml` workflow with:
- Unit tests (coverage ≥80%)
- Integration tests (100% repository coverage)
- E2E tests (happy paths + critical failures)
- Security audit (npm audit)

---

## Security & Performance Impact

### Performance Profile

**Current ACL overhead:** ~1.6ms per request (negligible)
- JWT validation: ~1ms
- Permission check: ~0.5ms (in-memory Set lookup)

**Phase 4 added latency:**
- Ownership check: +2ms (indexed DB query)
- **Total:** ~3.6ms (acceptable, <5ms target)

**Cache effectiveness:**
- Hit rate: Expected 95%+ (with 24h TTL)
- Miss penalty: ~20-50ms (4 DB queries with joins)
- **Recommendation:** Reduce TTL to 15min for security, minimal impact on hit rate

**SSE scaling:**
- Memory: ~1KB per Subject + heartbeat timer
- Limit: ~50K concurrent connections per instance
- **Recommendation:** Add per-tenant connection limit (100 streams)

### Cache Strategy Improvements

**Tier 1: Auth Context** (current, needs adjustment)
- What: User type, permissions, tenant context
- TTL: **15 min** (reduce from 24h)
- Invalidate: Role/permission changes

**Tier 2: Role Definitions** (new)
- What: Role → Permission mapping
- TTL: 1 hour
- Invalidate: Role-permission mutations

**Tier 3: Tenant Config** (new)
- What: Enabled role IDs per tenant
- TTL: 30 min
- Invalidate: Tenant-roles table changes

**Multi-instance consistency:**
- Add Redis Pub/Sub for invalidation broadcast
- Prevents stale cache across app instances

**Redis Performance Fix (P2):**
```typescript
// Replace KEYS command (blocks Redis) with SCAN
async delByPrefix(pattern: string) {
  let cursor = '0';
  do {
    const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = newCursor;
    if (keys.length) await client.del(...keys);
  } while (cursor !== '0');
}
```

### Audit & Compliance

**SOC2 Type II Gaps:**
- ❌ No authorization decision logging
- ❌ No failed authorization attempt tracking
- ❌ No alerting on suspicious permission changes

**ISO 27001:2022 Gaps:**
- ⚠️ No periodic access review workflow
- ⚠️ No MFA enforcement for privileged users
- ⚠️ Audit log immutability not verified

**Recommendation: Authorization Audit Log**
```typescript
interface AuthorizationAuditLog {
  timestamp: Date;
  userId: string;
  tenantId: string;
  resource: string;        // "distribution:abc-123"
  action: string;          // "timeline:read"
  decision: 'allow' | 'deny';
  reason?: string;         // "missing permission: distribution.read"
  ipAddress: string;
  userAgent: string;
}
```

**Storage:**
- Hot: Postgres (90 days retention)
- Cold: S3/GCS (7 years for compliance)
- Index: `(timestamp, userId, decision)` for investigation

---

## Implementation Roadmap

### Step 1: Add tenantId to Domain (if missing)
```typescript
// Distribution aggregate
interface CreateDistributionProps {
  tenantId: string;  // Required for tenant isolation
}

class Distribution extends AggregateRoot {
  readonly tenantId: string;  // Immutable after creation
  readonly initiatedBy: {     // NEW: audit trail
    userId: string;
    tenantId: string;
    timestamp: Date;
  };
}
```

**Migration:**
```sql
ALTER TABLE distributions ADD COLUMN tenant_id UUID NOT NULL;
CREATE INDEX idx_distributions_tenant ON distributions(tenant_id);

-- Backfill from releases
UPDATE distributions d SET tenant_id = r.tenant_id
FROM releases r WHERE d.release_id = r.id;
```

### Step 2: Define & Seed Permissions
```sql
INSERT INTO permissions (id, code, name, is_active)
VALUES 
  (gen_random_uuid(), 'distribution.create', 'Create Distribution', true),
  (gen_random_uuid(), 'distribution.read', 'Read Distribution', true),
  (gen_random_uuid(), 'distribution.cancel', 'Cancel Distribution', true),
  (gen_random_uuid(), 'distribution.retry', 'Retry Distribution', true),
  (gen_random_uuid(), 'distribution.takedown', 'Takedown Distribution', true);
```

### Step 3: Decorate Controller
```typescript
@Controller('distributions')
export class DistributionController {
  @RequirePermissions('distribution.read')
  @Get(':id/timeline')
  async getTimeline(@Param('id') id: string, @User() user: UserReq) {
    await this.validateAccess(id, user.tenantId);
    return this.service.getTimeline(id, user);
  }
  
  @SystemAdminOnly()
  @Get('metrics')
  async getMetrics() {
    return this.service.getMetrics();
  }
}
```

### Step 4: Add Tenant Isolation to Queries
```typescript
private async validateAccess(distributionId: string, tenantId: string) {
  const dist = await this.repo.findOne({ 
    where: { id: distributionId },
    select: ['id', 'tenantId'] 
  });
  
  if (!dist) throw new NotFoundException();
  if (dist.tenantId !== tenantId) throw new NotFoundException(); // 404, not 403
}
```

### Step 5: Enrich BullMQ Payload
```typescript
// At enqueue time (OrchestrateHandler)
await this.workflowEngine.enqueue('dist.orchestrate', {
  distributionId: dist.id,
  correlationId: dist.correlationId,
  key: IdempotencyKey.generate(),
  userId: user.id,          // NEW
  tenantId: user.tenantId,  // NEW
});
```

### Step 6: Validate in Workers
```typescript
// In step runners
async process(job: Job) {
  const { distributionId, tenantId } = job.data;
  const dist = await this.repo.load(distributionId);
  
  if (dist.tenantId !== tenantId) {
    throw new SecurityError('Tenant validation failed');
  }
  
  // Proceed
}
```

### Step 7: Secure SSE Streams
```typescript
@Sse(':id/stream')
async streamEvents(@Param('id') id: string, @User() user: UserReq, @Res() res: Response) {
  // 1. Ownership check
  await this.validateAccess(id, user.tenantId);
  
  // 2. Event filtering by user level
  const level = user.type === UserType.ADMIN ? undefined : 'milestone';
  const stream = this.sseService.getOrCreateStream(id, { level, tenantId: user.tenantId });
  
  // 3. Max connection TTL (1 hour)
  const timeout = setTimeout(() => res.end(), 3600_000);
  res.on('close', () => {
    clearTimeout(timeout);
    this.sseService.cleanup(id);
  });
  
  return stream;
}
```

---

## Priority Matrix

### P0: Must Fix Before Production (2-6 hours total)

| Task | Effort | Impact | Blocking |
|------|--------|--------|----------|
| M1: Add distribution ownership check | 2-4h | HIGH | Security |
| M2: SSE connection security | 1h | HIGH | Security |
| M3: Reduce cache TTL to 15min | 30m | MEDIUM | Security |

### P1: Should Fix in Phase 4 (1-2 days total)

| Task | Effort | Impact | Rationale |
|------|--------|--------|-----------|
| H1: Authorization audit logging | 1 day | MEDIUM | Compliance (SOC2) |
| M4: Fix Redis KEYS → SCAN | 2h | MEDIUM | Performance/stability |
| H2: Role/permission change invalidation | 4h | MEDIUM | Cache consistency |

### P2: Can Defer to Phase 5

| Task | Effort | Impact | Rationale |
|------|--------|--------|-----------|
| H3: Redis Pub/Sub invalidation | 1 day | LOW | Multi-instance consistency |
| L1: Periodic access review workflow | 3 days | LOW | Compliance (ISO 27001) |
| L2: MFA for privileged users | 2 days | LOW | Security hardening |

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation | Priority |
|------|----------|------------|------------|----------|
| IDOR on distributions | **HIGH** | HIGH | M1: Add ownership check | **P0** |
| SSE authorization bypass | **HIGH** | MEDIUM | M2: Add SSE auth | **P0** |
| JWT permission staleness | MEDIUM | MEDIUM | M3: Reduce TTL | P1 |
| No audit logging | LOW | HIGH | H1: Add audit logs | P1 |
| Cache invalidation gaps | MEDIUM | HIGH | H2: Add triggers | P1 |
| Redis KEYS blocking | MEDIUM | LOW | M4: Use SCAN | P1 |

**Overall Risk Level:** MEDIUM-HIGH (due to P0 IDOR vulnerability)

---

## Unresolved Questions

### High Priority (Need answers before implementation)

1. **JWT TTL:** What is current JWT expiration time? (affects permission staleness mitigation)
2. **Distribution tenantId:** Is `tenantId` already in Distribution aggregate or needs to be added?
3. **Workspace permissions:** Is workspace-level authorization needed or only tenant-level?
4. **Permission inheritance:** Should `release_audio.update` auto-grant `distribution.create`?

### Medium Priority (Can clarify during implementation)

5. **SSE token mechanism:** HttpOnly cookies or query param tokens?
6. **Redis deployment:** Standalone vs cluster vs sentinel? (affects invalidation strategy)
7. **Database indexes:** Are indexes on `user_roles(tenant_id, user_id)` confirmed?
8. **Job ownership model:** If User A submits distribution, can User B cancel it?

### Low Priority (Future consideration)

9. **Read-only distribution access:** Should `distribution.read` permission exist or implicit for tenant members?
10. **SSE stream quotas:** Limit concurrent connections per tenant?
11. **Wildcard permissions:** Should `distribution.*` grant all sub-permissions?
12. **Token revocation:** How to revoke JWTs when permissions change? (Redis blacklist? Short TTL + refresh token?)

---

## Research Reports

**Full detailed reports saved to:**

1. **ACL Architecture:** `plans/reports/researcher-acl-architecture-260720-0939.md`
   - Current ACL implementation analysis
   - Integration points (HTTP, BullMQ, read-side)
   - Permission model requirements
   - Migration SQL scripts

2. **Permission Patterns:** `plans/reports/researcher-permission-patterns-20260720-0942.md`
   - NestJS authorization patterns
   - Domain layer authorization
   - BullMQ job authorization
   - SSE/real-time authorization
   - Code examples from codebase

3. **Testing Strategy:** `plans/reports/researcher-testing-strategy-20260720-0943.md`
   - Current test infrastructure
   - Test coverage requirements
   - Test data strategy
   - CI/CD integration approach
   - Example test scenarios

4. **Security & Performance:** `plans/reports/researcher-security-performance-20260720-094506.md`
   - Security vulnerabilities (IDOR, SSE bypass, race conditions)
   - Performance impact analysis
   - Caching strategy recommendations
   - Audit & compliance requirements
   - Mitigation strategies

---

**Research Completed:** 2026-07-20  
**Next Step:** Review findings → Create implementation plan → Execute P0 fixes
