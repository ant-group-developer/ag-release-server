# ACL Integration Architecture Research — Distribution v-next Phase 4

**Date:** 2026-07-20  
**Context:** Phase 4 integration planning for distribution-orchestration module  
**Status:** Research complete  

---

## Executive Summary

Current ACL system uses **RBAC (Role-Based Access Control)** with **decorator-based permissions** enforced via global NestJS guards (`JwtAuthGuard` + `PolicyGuard`). The system supports:
- **Permission-based authorization** (ANY-of model via `@RequirePermissions()`)
- **Role-based gates** (SystemAdmin, TenantOwner, TenantAdmin)
- **Tenant isolation** (multi-tenant architecture with tenantId scoping)
- **User type hierarchy** (ADMIN > USER, with tenant-level OWNER > ADMIN > MEMBER)

**Distribution v-next integration:** Phase 4 needs ACL at **3 layers**:
1. **HTTP layer** (REST + SSE endpoints) — use existing decorators
2. **BullMQ job context** — propagate user context via job payload
3. **Domain queries** (read-side timeline) — filter by tenantId

**Key gap:** Distribution domain doesn't store `tenantId` yet — Phase 4 must add tenant context to aggregate.

---

## 1. Current ACL Implementation

### 1.1 Architecture Pattern

**Type:** Decorator + Guard pattern (NestJS standard)  
**Model:** RBAC with permission strings (`resource.action` format)  
**Enforcement:** Global APP_GUARD at module level

### 1.2 Core Components

#### PolicyGuard (`src/modules/auth/guards/policy.guard.ts`)
- Implements `CanActivate` interface
- Checks 8 authorization layers (in order):
  1. **Public routes** — `@PublicRoute()` → allow unauthenticated
  2. **User presence** — JWT token required (unless public)
  3. **SystemAdminOnly** — `@SystemAdminOnly()` → only `UserType.ADMIN`
  4. **SystemAdmin bypass** — admins skip all remaining checks
  5. **Tenant context** — validates `tenantId` present when needed
  6. **Permissions (ANY-of)** — `@RequirePermissions(p1, p2, ...)` → user has ≥1
  7. **Tenant type gates** — `@TenantWhiteLabelOnly()` → `TenantType.WHITE_LABEL`
  8. **Tenant role gates** — `@TenantOwnerOnly()` / `@TenantOwnerOrAdminOnly()`

#### Decorators (`src/modules/auth/decorators/auth.decorator.ts`)
```typescript
@RequirePermissions(...perms: Permission[])     // ANY-of permission check
@SystemAdminOnly()                              // Admin-only endpoint
@PublicRoute()                                  // Skip auth
@TenantOwnerOnly()                              // Tenant owner only
@TenantOwnerOrAdminOnly()                       // Tenant owner OR admin
@TenantWhiteLabelOnly()                         // White-label tenant only
```

#### User Context (`src/common/interface/common.interface.ts`)
```typescript
interface UserReq {
  sub: string;               // JWT subject
  id: string;                // User UUID
  email: string;
  name: string;
  isActive: boolean;
  type: UserType;            // ADMIN | USER
  tenantId: string;          // Current tenant context
  tenantType: TenantType;    // Tenant classification
  tenantUserType: TenantUserType; // OWNER | ADMIN | MEMBER
  permission: string[];      // Array of permission codes
}
```

### 1.3 Permission Registry

**Location:** `src/modules/permission/constants/permission.data.constant.ts`  
**Format:** Nested object with `resource.action` strings

**Existing permissions (relevant to distribution):**
```typescript
RELEASE_AUDIO: {
  CREATE: 'release_audio.create',
  READ: 'release_audio.read',
  UPDATE: 'release_audio.update',
  DELETE: 'release_audio.delete',
  REVIEW: 'release_audio.review',
  TAKE_DOWN: 'release_audio.take_down',
}
RELEASE_VIDEO: { /* same structure */ }
DSP: {
  CONFIGURE_INTEGRATION: 'dsp.configure_integration',
  UPDATE_POLICIES: 'dsp.update.policies',
  // ...
}
```

**Missing:** No `DISTRIBUTION.*` permissions yet — Phase 4 must define.

### 1.4 Database Schema

**Entities:**
- `permissions` — permission catalog (code, name, isActive)
- `role_permission` — M:N join (roleId, permissionId)
- `users` — stores `permission: string[]` denormalized for fast check

**Denormalization:** User permissions cached in JWT payload → no DB hit per request.

---

## 2. Integration Points for Distribution v-next

### 2.1 HTTP Layer (REST + SSE)

**Current state:** `DistributionController` has **NO ACL decorators** yet.

**Endpoints to protect:**
```typescript
// src/modules/distribution-orchestration/infrastructure/http/distribution.controller.ts

@Get(':id/timeline')           // Timeline query
@Sse(':id/stream')             // SSE real-time events
@Get('metrics')                // Observability metrics (admin-only)
```

**Recommended decorators:**

| Endpoint | Decorator | Rationale |
|----------|-----------|-----------|
| `GET /:id/timeline` | `@RequirePermissions('distribution.read')` | Read distribution events |
| `SSE /:id/stream` | `@RequirePermissions('distribution.read')` | Real-time distribution events |
| `GET /metrics` | `@SystemAdminOnly()` | Observability for ops team only |

**Current behavior:** Timeline filters events by user type (admin sees all, user sees milestones) — but **NO tenant isolation check**.

**Gap:** Controller extracts `user.type` but ignores `user.tenantId` → **cross-tenant data leak risk**.

### 2.2 BullMQ Job Context

**Challenge:** Jobs run in worker processes **without HTTP request context** → no `req.user`.

**Current job payload:**
```typescript
interface JobPayload {
  distributionId: string;
  correlationId: string;
  key: string;              // Idempotency key
}
```

**Missing:** No `tenantId` or `userId` in payload → workers can't enforce ACL.

**Integration strategy:**

1. **Enrich payload** at enqueue time:
```typescript
interface JobPayload {
  distributionId: string;
  correlationId: string;
  key: string;
  userId: string;           // Who triggered action
  tenantId: string;         // Tenant context
}
```

2. **Validation in workers:**
   - Load distribution aggregate
   - Assert `distribution.tenantId === payload.tenantId`
   - Log security violation if mismatch (DLQ + alert)

3. **Use cases:**
   - User triggers `SUBMIT` command → enqueue with `req.user.id` + `req.user.tenantId`
   - Worker loads distribution → validates tenant ownership
   - Admin overrides → set `tenantId = null` (system job)

### 2.3 Read-Side Queries (Timeline Projection)

**Current implementation:** `DistributionTimelineQueryService` queries `distribution_timeline_events` table.

**Tenant isolation:** NOT IMPLEMENTED yet.

**Required changes:**

1. **Add tenantId to timeline table:**
```sql
ALTER TABLE distribution_timeline_events 
ADD COLUMN tenant_id UUID NOT NULL;

CREATE INDEX idx_timeline_tenant_distribution 
ON distribution_timeline_events(tenant_id, distribution_id);
```

2. **Filter queries by tenantId:**
```typescript
async getTimeline(query: TimelineQueryDto, user: UserReq) {
  const where = { distributionId: query.distributionId };
  
  // Tenant isolation (unless system admin)
  if (user.type !== UserType.ADMIN) {
    where.tenantId = user.tenantId;
  }
  
  return this.repo.find({ where, order: { seq: 'ASC' } });
}
```

3. **SSE stream authorization:**
   - Before creating stream, validate user can access distribution
   - Store `tenantId` in SSE stream metadata
   - Filter pushed events by tenant (defense-in-depth)

---

## 3. Permission Model Requirements

### 3.1 New Permissions for Distribution

**Proposed permissions:**
```typescript
DISTRIBUTION: {
  CREATE: 'distribution.create',        // Submit new distribution
  READ: 'distribution.read',            // View status, timeline, logs
  UPDATE: 'distribution.update',        // Modify settings (future)
  CANCEL: 'distribution.cancel',        // Cancel in-progress distribution
  RETRY: 'distribution.retry',          // Retry failed distribution
  TAKEDOWN: 'distribution.takedown',    // Initiate takedown
  METRICS: 'distribution.metrics',      // View observability metrics
}
```

**Inheritance from existing permissions:**
- `release_audio.update` → implies `distribution.create` (submit audio)
- `release_video.update` → implies `distribution.create` (submit video)
- System admins → bypass all distribution permissions

### 3.2 Access Control Matrix

| Action | System Admin | Tenant Owner | Tenant Admin | Tenant Member |
|--------|-------------|--------------|--------------|---------------|
| Submit distribution | ✅ | ✅ (own tenant) | ✅ (with perm) | ✅ (with perm) |
| View timeline (milestone) | ✅ | ✅ | ✅ | ✅ |
| View timeline (all events) | ✅ | ❌ | ❌ | ❌ |
| View SSE stream | ✅ | ✅ | ✅ (with perm) | ✅ (with perm) |
| Cancel distribution | ✅ | ✅ | ✅ (with perm) | ❌ |
| Retry failed | ✅ | ✅ | ✅ (with perm) | ❌ |
| View metrics | ✅ | ❌ | ❌ | ❌ |
| Cross-tenant access | ✅ | ❌ | ❌ | ❌ |

### 3.3 Tenant Isolation Rules

**Invariant:** Non-admin users can ONLY access distributions within their `tenantId`.

**Enforcement layers:**
1. **Query filters** — WHERE tenantId = :userTenantId
2. **Aggregate validation** — Assert loaded distribution belongs to user's tenant
3. **Projection filters** — Timeline/SSE events filtered by tenantId
4. **Job validation** — Workers check distribution.tenantId matches payload.tenantId

**Edge case — multi-tenant admins:** System admins (`UserType.ADMIN`) bypass tenant checks → can access all distributions (for support/debugging).

---

## 4. Recommended Architecture

### 4.1 Layered Authorization Strategy

**Layer 1 — HTTP Guards (existing):**
- Use `@RequirePermissions('distribution.read')` on endpoints
- Enforced by global `PolicyGuard`
- Validates JWT + permission strings

**Layer 2 — Service-Level Tenant Isolation:**
```typescript
// In service methods
async getTimeline(query: TimelineQueryDto, user: UserReq) {
  // Check permission (redundant defense)
  if (!user.permission.includes('distribution.read')) {
    throw new ForbiddenException();
  }
  
  // Enforce tenant isolation
  const distribution = await this.repo.findById(query.distributionId);
  if (!distribution) throw new NotFoundException();
  
  if (user.type !== UserType.ADMIN && distribution.tenantId !== user.tenantId) {
    throw new ForbiddenException('Cross-tenant access denied');
  }
  
  return this.queryTimeline(query);
}
```

**Layer 3 — Domain-Level Tenant Context:**
```typescript
// Add tenantId to Distribution aggregate
interface CreateDistributionProps {
  // ... existing fields
  tenantId: string;  // NEW: required for tenant isolation
}

class Distribution extends AggregateRoot {
  readonly tenantId: string;  // Immutable after creation
}
```

**Layer 4 — Job-Level Validation:**
```typescript
// In BullMQ worker
async process(job: Job<JobPayload>) {
  const { distributionId, tenantId, userId } = job.data;
  
  const dist = await this.repo.load(distributionId);
  if (dist.tenantId !== tenantId) {
    logger.error('Tenant mismatch in job', { distributionId, expected: dist.tenantId, actual: tenantId });
    throw new SecurityError('Tenant validation failed');
  }
  
  // Proceed with job
}
```

### 4.2 Middleware vs Decorator Pattern

**Decision: Decorator pattern (status quo)**

**Rationale:**
- Consistent with existing codebase (all controllers use decorators)
- Compile-time visibility (decorators visible in controller)
- NestJS ecosystem standard
- No performance difference (both execute per-request)

**Alternative (middleware) rejected:**
- Would require custom middleware chain
- Less discoverable (hidden in module config)
- Breaks consistency with 50+ existing controllers

### 4.3 Permission Caching Strategy

**Current:** Permissions cached in JWT payload (expires 7d by default).

**Trade-offs:**
- ✅ **Fast:** No DB query per request
- ✅ **Scalable:** Stateless auth
- ⚠️ **Stale:** Permission changes require re-login or token refresh

**Distribution-specific considerations:**
- Distribution workflows are **long-running** (minutes to hours)
- Permission changes during execution → existing jobs continue with old permissions
- **Mitigation:** BullMQ jobs store `userId` + `tenantId` → validate on each step

**Recommendation:** Keep JWT caching, add **per-job validation** for critical operations (cancel, takedown).

### 4.4 Error Handling for Unauthorized Access

**HTTP responses:**
```typescript
401 Unauthorized    // No JWT or invalid JWT
403 Forbidden       // Authenticated but lacks permission
404 Not Found       // Cross-tenant access (hide existence)
```

**Security principle:** Return `404` instead of `403` for cross-tenant access to avoid information leakage.

**Example:**
```typescript
const dist = await this.repo.findById(id);
if (!dist) throw new NotFoundException();

if (user.tenantId !== dist.tenantId && user.type !== UserType.ADMIN) {
  throw new NotFoundException();  // NOT ForbiddenException
}
```

**BullMQ failures:**
- Unauthorized job → move to DLQ + alert security team
- Log with high severity: `{ level: 'error', event: 'acl_violation', userId, tenantId, distributionId }`

---

## 5. Implementation Considerations

### 5.1 Migration Path (Phase 4)

**Step 1 — Add tenantId to domain:**
```typescript
// Update Distribution aggregate
interface CreateDistributionProps {
  tenantId: string;  // NEW
}

// Migration
ALTER TABLE distributions ADD COLUMN tenant_id UUID NOT NULL;
CREATE INDEX idx_distributions_tenant ON distributions(tenant_id);
```

**Step 2 — Define permissions:**
```typescript
// Add to permission.data.constant.ts
DISTRIBUTION: {
  CREATE: 'distribution.create',
  READ: 'distribution.read',
  CANCEL: 'distribution.cancel',
  RETRY: 'distribution.retry',
  TAKEDOWN: 'distribution.takedown',
}
```

**Step 3 — Seed permissions:**
```sql
-- Add to seed migration
INSERT INTO permissions (id, code, name, is_active)
VALUES 
  (uuid_generate_v4(), 'distribution.create', 'Create Distribution', true),
  (uuid_generate_v4(), 'distribution.read', 'Read Distribution', true),
  (uuid_generate_v4(), 'distribution.cancel', 'Cancel Distribution', true),
  (uuid_generate_v4(), 'distribution.retry', 'Retry Distribution', true),
  (uuid_generate_v4(), 'distribution.takedown', 'Takedown Distribution', true);
```

**Step 4 — Add decorators to controller:**
```typescript
@Controller('distributions')
export class DistributionController {
  @RequirePermissions('distribution.read')
  @Get(':id/timeline')
  async getTimeline(@Param('id') id: string, @User() user: UserReq) {
    return this.service.getTimeline(id, user);
  }
  
  @SystemAdminOnly()
  @Get('metrics')
  async getMetrics() {
    return this.service.getMetrics();
  }
}
```

**Step 5 — Add tenant isolation to queries:**
```typescript
async getTimeline(id: string, user: UserReq) {
  const dist = await this.repo.findOne({ 
    where: { id },
    relations: ['channels'] 
  });
  
  if (!dist) throw new NotFoundException();
  
  // Tenant isolation
  if (user.type !== UserType.ADMIN && dist.tenantId !== user.tenantId) {
    throw new NotFoundException();
  }
  
  return this.timelineQuery.getTimeline(id, user);
}
```

**Step 6 — Enrich BullMQ payload:**
```typescript
// At enqueue time (OrchestrateHandler)
await this.workflowEngine.enqueue('dist.orchestrate', {
  distributionId: dist.id,
  correlationId: dist.correlationId,
  key: IdempotencyKey.generate(),
  userId: user.id,      // NEW
  tenantId: user.tenantId,  // NEW
});
```

**Step 7 — Validate in workers:**
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

### 5.2 Performance Implications

**Guard overhead:**
- Per-request: ~0.5ms (metadata reflection + Set lookup)
- Negligible compared to DB query latency (5-50ms)

**Database indexes:**
```sql
-- Required for tenant-scoped queries
CREATE INDEX idx_distributions_tenant_state 
ON distributions(tenant_id, state);

CREATE INDEX idx_timeline_tenant_distribution 
ON distribution_timeline_events(tenant_id, distribution_id);
```

**Query patterns:**
```sql
-- Fast: tenant + PK
SELECT * FROM distributions WHERE tenant_id = ? AND id = ?;

-- Fast: tenant + state (for list views)
SELECT * FROM distributions WHERE tenant_id = ? AND state = 'DELIVERING';

-- Slow: cross-tenant (admin only)
SELECT * FROM distributions WHERE state = 'DELIVERING';
```

**Recommendation:** Add composite indexes (tenant_id, other_columns) for common query patterns.

### 5.3 Testing Strategy

**Unit tests:**
```typescript
describe('PolicyGuard', () => {
  it('should deny access without permission', () => {
    const user = { permission: [], tenantId: 'T1' };
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
  
  it('should allow system admin bypass', () => {
    const user = { type: UserType.ADMIN };
    expect(guard.canActivate(context)).toBe(true);
  });
});
```

**Integration tests:**
```typescript
describe('DistributionController', () => {
  it('should return 404 for cross-tenant access', async () => {
    const userA = { tenantId: 'T1', permission: ['distribution.read'] };
    const distB = await factory.createDistribution({ tenantId: 'T2' });
    
    await request(app.getHttpServer())
      .get(`/distributions/${distB.id}/timeline`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
  
  it('should allow admin cross-tenant access', async () => {
    const admin = { type: UserType.ADMIN };
    const dist = await factory.createDistribution({ tenantId: 'T2' });
    
    await request(app.getHttpServer())
      .get(`/distributions/${dist.id}/timeline`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
```

**Security tests:**
```typescript
describe('Tenant isolation', () => {
  it('should prevent job payload tampering', async () => {
    const dist = await factory.createDistribution({ tenantId: 'T1' });
    
    // Attacker tries to spoof tenantId in job payload
    const job = { distributionId: dist.id, tenantId: 'T2' };
    
    await expect(worker.process(job)).rejects.toThrow(SecurityError);
  });
});
```

---

## 6. Risks & Mitigations

### Risk 1: Cross-Tenant Data Leak

**Scenario:** User from Tenant A accesses distribution from Tenant B via direct ID guess.

**Likelihood:** HIGH (if tenant checks missing)  
**Impact:** CRITICAL (data breach)

**Mitigations:**
1. **Defense-in-depth:** Check tenantId at controller, service, and query layers
2. **Return 404 (not 403):** Hide existence of cross-tenant resources
3. **Audit logging:** Log all cross-tenant access attempts
4. **Integration tests:** Cover cross-tenant scenarios

### Risk 2: Permission Changes During Long-Running Jobs

**Scenario:** User starts distribution with `distribution.create` permission. Admin revokes permission mid-execution. Job continues with stale permissions.

**Likelihood:** MEDIUM  
**Impact:** LOW (benign: job already authorized at start)

**Mitigations:**
1. **Accept stale permissions:** Job authorized at enqueue time
2. **Critical operations only:** Re-check permissions for cancel/takedown
3. **Audit trail:** Log userId + permissions in job metadata

### Risk 3: Missing tenantId in Aggregate

**Scenario:** Phase 4 forgets to add tenantId to Distribution aggregate → tenant isolation impossible.

**Likelihood:** LOW (caught in code review)  
**Impact:** CRITICAL (blocks Phase 4)

**Mitigations:**
1. **Add tenantId in Step 1:** Make it required field in CreateDistributionProps
2. **Migration:** Add NOT NULL column + backfill from release.tenantId
3. **Validation:** Unit test Distribution.create() requires tenantId

### Risk 4: SSE Stream Authorization Bypass

**Scenario:** Attacker hijacks SSE stream by guessing distributionId → receives real-time events from other tenant.

**Likelihood:** MEDIUM (if no auth on SSE)  
**Impact:** HIGH (real-time data leak)

**Mitigations:**
1. **Validate before stream creation:** Check user can access distribution
2. **Embed tenantId in stream:** Filter events by tenant in relay
3. **Close stream on auth failure:** Detect JWT expiry and disconnect

### Risk 5: Admin Overreach

**Scenario:** System admin can access all distributions → insider threat.

**Likelihood:** LOW (trusted staff)  
**Impact:** HIGH (privacy concern)

**Mitigations:**
1. **Audit all admin access:** Log every cross-tenant query
2. **RBAC for admins:** Support-admin vs super-admin roles
3. **Alert on sensitive ops:** Notify tenant owner when admin views their data

---

## 7. Unresolved Questions

1. **Workspace-level permissions?**
   - Current system: tenant-level only (no workspace entity found)
   - Distribution v-next: also tenant-scoped?
   - **Action:** Confirm with product team if workspace context needed

2. **Permission inheritance:**
   - Should `release_audio.update` auto-grant `distribution.create`?
   - Or require explicit `distribution.*` permissions?
   - **Action:** Define permission dependency graph

3. **Read-only distribution access:**
   - Should there be `distribution.read` permission?
   - Or implicit (anyone in tenant can view)?
   - **Action:** Review with security team

4. **SSE stream quotas:**
   - Should we limit concurrent SSE connections per tenant?
   - Memory concern: 1000 tenants × 10 distributions × SSE = 10k streams
   - **Action:** Load test SSE relay with realistic tenant count

5. **BullMQ job ownership:**
   - If user A submits distribution, user B cancels → allowed?
   - Or lock distribution to original submitter?
   - **Action:** Define ownership model (tenant-level vs user-level)

---

## Appendix A: Code References

**ACL Implementation:**
- Guard: `src/modules/auth/guards/policy.guard.ts`
- Decorators: `src/modules/auth/decorators/auth.decorator.ts`
- Permissions: `src/modules/permission/constants/permission.data.constant.ts`
- User context: `src/common/interface/common.interface.ts`

**Distribution v-next:**
- Controller: `src/modules/distribution-orchestration/infrastructure/http/distribution.controller.ts`
- Aggregate: `src/modules/distribution-orchestration/domain/distribution/distribution.aggregate.ts`
- Job payload: `src/modules/distribution-orchestration/application/ports/workflow-engine.port.ts`
- Timeline query: `src/modules/distribution-orchestration/application/queries/distribution-timeline-query.service.ts`

**Existing ACL Usage:**
- Release controller: `src/modules/release/controllers/release.controller.ts` (uses `@RequirePermissions`, `@SystemAdminOnly`)
- Draft controller: `src/modules/release/controllers/release.draft.controller.ts` (uses `@PublicRoute`)

---

## Appendix B: Permission Strings Catalog

**Existing (relevant):**
```
release_audio.create
release_audio.read
release_audio.update
release_audio.delete
release_audio.review
release_audio.take_down

release_video.* (same structure)

dsp.configure_integration
dsp.update.policies
dsp.update.deals
```

**Proposed (new):**
```
distribution.create
distribution.read
distribution.cancel
distribution.retry
distribution.takedown
distribution.metrics (admin-only)
```

---

## Appendix C: Migration SQL

```sql
-- Step 1: Add tenantId to distributions table
ALTER TABLE distributions 
ADD COLUMN tenant_id UUID NOT NULL;

-- Step 2: Backfill from releases (assuming distribution.releaseId exists)
UPDATE distributions d
SET tenant_id = r.tenant_id
FROM releases r
WHERE d.release_id = r.id;

-- Step 3: Add indexes
CREATE INDEX idx_distributions_tenant 
ON distributions(tenant_id);

CREATE INDEX idx_distributions_tenant_state 
ON distributions(tenant_id, state);

-- Step 4: Add tenantId to timeline events
ALTER TABLE distribution_timeline_events 
ADD COLUMN tenant_id UUID NOT NULL;

-- Step 5: Backfill timeline tenantId from distributions
UPDATE distribution_timeline_events dte
SET tenant_id = d.tenant_id
FROM distributions d
WHERE dte.distribution_id = d.id;

-- Step 6: Add timeline indexes
CREATE INDEX idx_timeline_tenant_distribution 
ON distribution_timeline_events(tenant_id, distribution_id);

-- Step 7: Seed distribution permissions
INSERT INTO permissions (id, code, name, is_active, note)
VALUES 
  (gen_random_uuid(), 'distribution.create', 'Create Distribution', true, 'Submit new distribution to DSPs'),
  (gen_random_uuid(), 'distribution.read', 'Read Distribution', true, 'View distribution status and timeline'),
  (gen_random_uuid(), 'distribution.cancel', 'Cancel Distribution', true, 'Cancel in-progress distribution'),
  (gen_random_uuid(), 'distribution.retry', 'Retry Distribution', true, 'Retry failed distribution'),
  (gen_random_uuid(), 'distribution.takedown', 'Takedown Distribution', true, 'Initiate distribution takedown');
```
