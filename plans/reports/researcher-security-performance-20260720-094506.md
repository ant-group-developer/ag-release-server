# Security & Performance Research: Distribution ACL Phase 4

**Research Date:** 2026-07-20  
**Context:** Phase 4 ACL Integration for Distribution Orchestration v-next  
**Researcher:** general-purpose agent

---

## Executive Summary

Phase 4 ACL integration for distribution orchestration introduces security and performance considerations across authorization enforcement, SSE streaming, caching strategies, and audit compliance. Current system has robust RBAC with Redis caching (24h TTL) but lacks distribution-specific resource-level checks and SSE authorization filtering.

**Critical Findings:**
- **IDOR Risk:** Distribution resources lack tenant/user ownership validation
- **SSE Auth Gap:** Stream endpoints need per-connection authorization + event filtering
- **Cache Strategy:** 24h TTL too long for permission changes; lacks event-driven invalidation
- **Audit Gap:** No authorization logging for distribution operations

---

## 1. Security Vulnerabilities

### 1.1 Authorization Bypass Scenarios

**Current ACL Architecture (Existing System):**
- Role-based access control (RBAC) with permission-based guards (`PolicyGuard`)
- Redis-cached auth context (24h TTL): `{userId}_{tenantId} → AuthContext`
- Permission check: decorator-driven (`@Permissions([Permission.XYZ])`)
- Invalidation: manual via `invalidateAuthContext(userId?, tenantId?)`

**Identified Vulnerabilities:**

#### V1: Missing Resource-Level Authorization (IDOR)
**Severity:** HIGH  
**Location:** `distribution.controller.ts:getTimeline()`, `streamEvents()`

```typescript
// CURRENT — only checks authentication, NOT ownership
@Get(':id/timeline')
async getTimeline(@Param('id') id: string, @User() user: UserReq) {
  // ❌ No check: does user.tenantId own this distribution?
  const result = await this.timelineQuery.getTimeline({ distributionId: id });
}
```

**Attack:**
1. User A (tenant T1) submits distribution D1
2. User B (tenant T2) guesses/enumerates D1's UUID
3. User B calls `GET /distributions/{D1}/timeline` → succeeds (IDOR)
4. User B sees T1's distribution progress, metadata, errors

**Root Cause:** Distribution aggregate has `tenantId` field but no tenant-scoped queries in Phase 3 implementation.

**Mitigation Required:**
```typescript
// Add tenant ownership check
const dist = await this.repo.load(ctx, id);
if (!dist || dist.tenantId !== user.tenantId) {
  throw new ForbiddenException('Distribution not found or access denied');
}
```

#### V2: SSE Stream Authorization Bypass
**Severity:** HIGH  
**Location:** `distribution-sse.service.ts`, `distribution.controller.ts:streamEvents()`

**Current Implementation:**
```typescript
@Sse(':id/stream')
streamEvents(@Param('id') id: string, @Res() response: Response) {
  const stream = this.sseService.getOrCreateStream(id);
  response.on('close', () => this.sseService.cleanup(id));
  return stream; // ❌ No authorization check
}
```

**Vulnerabilities:**
1. **Connection-time bypass:** No validation that user's tenant owns the distribution
2. **Event-time filtering missing:** Admin sees all events; users should see milestone-only (exists in REST API but not SSE)
3. **Token expiration:** JWT expires but SSE connection stays open → stale permissions
4. **Cross-tenant event leakage:** If SSE service buggy, events could route to wrong connections

**Mitigation Required:**
```typescript
@Sse(':id/stream')
async streamEvents(@Param('id') id: string, @User() user: UserReq, @Res() res: Response) {
  // 1. Verify ownership
  const dist = await this.validateAccess(id, user.tenantId);
  
  // 2. Pass user context to SSE service for event filtering
  const level = user.type === UserType.ADMIN ? undefined : 'milestone';
  const stream = this.sseService.getOrCreateStream(id, { level, tenantId: user.tenantId });
  
  // 3. Implement token refresh or max connection TTL
  const maxAge = 3600_000; // 1h
  setTimeout(() => res.end(), maxAge);
  
  res.on('close', () => this.sseService.cleanup(id));
  return stream;
}
```

#### V3: Privilege Escalation via Role Mutation
**Severity:** MEDIUM  
**Location:** `access-control.service.ts:updateUserRoles()`

**Current Protection:**
- Full-access users (OWNER/ADMIN) cannot have roles manually overridden (line 185-187)
- Role changes invalidate Redis cache (line 220)

**Remaining Risk:**
- Race condition: user with expiring OWNER status makes request → cache lookup passes → role downgrade happens → request completes with elevated perms
- Mitigation: Check `user.type` and `tenantUserType` at request time (already done in `PolicyGuard`)

#### V4: Optimistic Lock Bypass (Already Mitigated)
**Severity:** LOW (already handled)  
**Location:** `distribution.repository.ts` (Phase 2)

Repository uses optimistic locking (`version` field) to prevent concurrent writes:
```typescript
UPDATE distributions SET state = ?, version = version + 1
WHERE id = ? AND version = ?
```
If version mismatch → `OptimisticLockError` → BullMQ retries job. **No additional action needed.**

---

### 1.2 Race Conditions (TOCTOU)

**Scenario:** Time-of-Check Time-of-Use attacks on permission validation

**R1: Cache-DB Permission Drift**
**Severity:** MEDIUM  
**Window:** Up to 24 hours (AUTH_CACHE_TTL)

**Attack Flow:**
1. Admin grants User X permission P at T0
2. User X's cache entry exists with old permissions (cached at T0-1h)
3. Admin revokes permission P at T0+5min
4. `invalidateAuthContext(X, tenant)` called → Redis key deleted
5. BUT: User X has in-flight request with stale JWT (contains old permissions)
6. `PolicyGuard` checks `user.permission` from JWT → permission P still present → access granted

**Current Mitigation:**
- JWT contains permissions snapshot at issuance time
- JWT expiry forces re-authentication → fresh permission lookup
- `invalidateAuthContext()` called on role/permission mutations (line 220)

**Gap:** JWT TTL not documented; if > 24h, cache invalidation ineffective.

**Recommendation:**
- Set JWT TTL ≤ 15 minutes for permission-sensitive operations
- Add `iat` (issued-at) claim check: reject tokens older than permission change timestamp
- Implement permission version in JWT: `{ perms: ['P1'], permsVersion: 'v2-20260720' }`

**R2: SSE Event Filtering Race**
**Severity:** LOW  
**Window:** Event emission time (~10ms)

SSE service pushes events via in-memory Subject:
```typescript
pushEvent(distributionId: string, event: TimelineEventDto): void {
  this.streams.get(distributionId)?.next({ data: event }); // All subscribers get event
}
```

If user's permissions change AFTER SSE connection established but BEFORE event pushed:
1. User connects with milestone-only access
2. Admin upgrades user to full access
3. Event arrives → still filtered to milestone-only (stale `level` param from connection time)

**Mitigation:** Low impact (user just needs to reconnect); document max SSE connection TTL (1h recommended).

---

### 1.3 Token/Session Security in SSE

**T1: JWT Transmission for SSE**
**Current Implementation:** Not visible in controller code; likely cookie-based or Authorization header.

**Best Practice (2025):**
- SSE uses EventSource API in browser → cannot set custom headers → must use query param or cookie
- **Query param JWT:** `GET /distributions/:id/stream?token=<jwt>` — INSECURE (logged in proxy/CDN)
- **Cookie-based:** Secure, HttpOnly, SameSite=Strict — RECOMMENDED
- **Upgrade to WebSocket:** If bidirectional needed (not current scope)

**Recommendation:** Verify current implementation uses HttpOnly cookies, not URL tokens.

**T2: Connection Hijacking**
- SSE over HTTPS → encrypted
- No Cross-Site SSE leakage if `SameSite=Strict` cookies used
- **Gap:** If using `SameSite=None`, vulnerable to CSRF → attacker site can open victim's SSE stream

**T3: Token Expiration During Long-Lived Connections**
**Current:** No max connection TTL enforced

**Recommendation:**
```typescript
const MAX_SSE_CONNECTION_MS = 3600_000; // 1 hour
setTimeout(() => {
  response.write(':expire\n\n'); // Send expiry event
  response.end();
}, MAX_SSE_CONNECTION_MS);
```

Client auto-reconnects with fresh JWT.

---

## 2. Performance Impact Analysis

### 2.1 Permission Check Latency

**Current Flow (per request):**
1. `JwtAuthGuard` validates JWT signature (~1ms)
2. Extract `user` payload from JWT (in-memory, ~0.1ms)
3. `PolicyGuard.canActivate()` checks permissions from JWT payload (in-memory, ~0.5ms)

**Latency:** ~1.6ms per request (negligible)

**Cached Auth Context Flow (cache hit):**
```typescript
getAuthContext(userId, tenantId) → Redis GET → ~2-5ms (local Redis)
```

**Cache Miss Flow:**
```typescript
buildAuthContext() → Postgres queries:
  - SELECT user (1 query)
  - SELECT tenant (1 query) 
  - SELECT tenant_user membership (1 query)
  - SELECT user_roles + role_permissions (1 query with joins)
Total: ~4 queries, ~20-50ms (indexed, pooled)
```

**Performance Profile:**
- Cache hit rate: Expected 95%+ (24h TTL, stable permissions)
- P50 latency: ~2ms (cache hit)
- P99 latency: ~50ms (cache miss + DB roundtrip)

**Phase 4 Impact (adding distribution ownership check):**
```sql
SELECT id, tenant_id FROM distributions WHERE id = ?
```
- Indexed lookup: ~1-2ms
- Added to existing request: P50 = 3-4ms, P99 = 52ms
- **Impact:** Acceptable (<5ms added latency)

---

### 2.2 Database Query Overhead

**Current ACL Queries (per cache miss):**
```sql
-- 1. User lookup
SELECT id, type, is_active, email, name, avatar FROM users WHERE id = ?;

-- 2. Tenant lookup  
SELECT is_active, type FROM tenants WHERE id = ?;

-- 3. Tenant membership
SELECT type FROM tenant_users WHERE tenant_id = ? AND user_id = ?;

-- 4. Permissions (complex)
SELECT DISTINCT permission.code 
FROM user_roles
LEFT JOIN roles ON user_roles.role_id = roles.id
LEFT JOIN role_permissions ON roles.id = role_permissions.role_id
LEFT JOIN permissions ON role_permissions.permission_id = permissions.id
WHERE user_roles.tenant_id = ? 
  AND user_roles.user_id = ?
  AND roles.is_active = true;
```

**Optimization Status:**
- ✅ Indexes exist on `user_id`, `tenant_id`, `role_id` (assumed from ORM annotations)
- ✅ JOIN count acceptable (4 tables max)
- ⚠️  No query plan analysis in codebase

**Recommended Indexes (verify exist):**
```sql
CREATE INDEX idx_user_roles_tenant_user ON user_roles(tenant_id, user_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_roles_active ON roles(is_active) WHERE is_active = true;
```

**Phase 4 Additional Query:**
```sql
SELECT tenant_id FROM distributions WHERE id = ?;
-- Index: PRIMARY KEY (id) → already optimal
```

---

### 2.3 Caching Strategy Effectiveness

**Current Implementation:**
- **Store:** Redis (via `@nestjs/cache-manager`)
- **TTL:** 24 hours (86,400,000 ms)
- **Key Pattern:** `{EntityCache.AUTH_CONTEXT}_{userId}_{tenantId}`
- **Invalidation:** Manual via `invalidateAuthContext(userId?, tenantId?)`

**Effectiveness Metrics (estimated):**
- **Hit Rate:** 95%+ for stable user sessions
- **Eviction Rate:** Low (24h TTL rarely reached; invalidation triggers first)
- **Memory Usage:** ~1KB per user-tenant pair × active users

**Weaknesses:**

**W1: Invalidation Coverage Gaps**
- ✅ Triggers: `updateUserRoles()` invalidates specific user-tenant
- ❌ Missing: Role definition changes (e.g., EDITOR role gains new permission)
- ❌ Missing: Permission code changes (rare but possible)
- ❌ Missing: Tenant-role enablement changes (`tenant_roles` table)

**W2: Prefix-Based Invalidation Inefficiency**
```typescript
async delByPrefix({ entity, prefix }) {
  const pattern = `${entity}_${prefix}`;
  const keys = await client.keys(pattern); // ❌ O(N) scan on Redis
  await Promise.all(keys.map(k => this.cacheManager.del(k)));
}
```

**Problem:** `KEYS` command blocks Redis in production; use `SCAN` instead.

**W3: No Cache Warming**
- On cold start, all users trigger cache miss simultaneously → DB spike
- Recommendation: Pre-populate cache for common roles (OWNER, ADMIN) on app start

**W4: Distributed Cache Consistency**
- Multiple app instances share Redis → consistent
- BUT: If using Redis Cluster with sharding → `delByPrefix` may miss keys on other nodes
- Recommendation: Use Redis Pub/Sub for invalidation events across instances

---

### 2.4 High-Throughput Operations Impact

**Distribution Orchestration Throughput:**
- BullMQ processes jobs concurrently (configurable concurrency)
- Each job calls `OrchestrateHandler.handle()` → no ACL check (internal operation)
- External API calls (`GET /distributions/:id/timeline`) rate-limited by NestJS + user permissions

**SSE Scaling:**
- In-memory Subject per `distributionId` → grows with active connections
- Heartbeat interval (30s) per stream → CPU overhead
- Current metrics: `activeStreams`, `connectionsTotal`, `disconnectionsTotal`, `eventsPushedTotal`

**Bottleneck Analysis:**
1. **Memory:** Each Subject ~1KB + heartbeat timer → 10K connections = ~10MB (acceptable)
2. **CPU:** RxJS `merge(events$, heartbeat$)` per connection → 10K streams = moderate overhead
3. **Network:** SSE keepalive every 30s → 10K connections = 333 msg/sec (low bandwidth)

**ACL Impact on SSE:**
- Adding `level` filtering (admin vs milestone) → negligible (in-memory filter)
- Adding `tenantId` check on connection → +2ms (single DB query)
- **Scaling limit:** ~50K concurrent SSE connections per instance (estimate)

**Recommendation:** Add SSE connection limit per tenant (e.g., 100 concurrent streams).

---

### 2.5 Impact on BullMQ Workers

**Current Architecture (Phase 2):**
- Orchestrator queue: `dist.orchestrate` (handles commands)
- Step queues: `dist.provision-id`, `dist.build-package`, `dist.sftp-upload`, etc.
- Workers call `OrchestrateHandler.handle()` → internal operation, NO ACL check

**Phase 4 ACL Impact:**
- ✅ Workers do NOT trigger permission checks (no user context)
- ✅ Distribution aggregate already has `tenantId` → tenant isolation preserved
- ⚠️  If adapters (SFTP, gRPC) need tenant-specific credentials → fetch from vault per job

**Performance Concern:**
If Phase 4 adds ACL checks to INTERNAL worker operations → massive performance hit.

**Recommendation:** Keep ACL checks at API boundary only; workers trust aggregate `tenantId`.

---

## 3. Caching Architecture Recommendations

### 3.1 What to Cache

**Tier 1: Auth Context (current)** ✅
- User type, tenant type, tenant-user type
- Resolved permission codes
- TTL: 15 minutes (reduced from 24h)

**Tier 2: Role Definitions (new)** ⭐
- Role → Permission mapping
- TTL: 1 hour
- Invalidate on: role-permission changes

**Tier 3: Tenant Configuration (new)** ⭐
- Enabled role IDs per tenant
- TTL: 30 minutes
- Invalidate on: tenant-roles table changes

**Do NOT Cache:**
- Individual resource ownership (distribution.tenantId) → query per request
- Temporary state (distribution.state) → changes frequently

---

### 3.2 Cache Invalidation Triggers

**Current Triggers (existing):**
- `updateUserRoles()` → invalidate `{userId}_{tenantId}`

**Missing Triggers (add in Phase 4):**

**T1: Role Definition Changes**
```typescript
// role.service.ts
async updateRolePermissions(roleId: string, permissionIds: string[]) {
  await this.repo.save(...);
  // Invalidate all users with this role
  await this.accessControl.invalidateByRole(roleId);
}
```

**T2: Tenant-Role Enablement Changes**
```typescript
// tenant-roles.service.ts
async updateTenantRoles(tenantId: string, roleIds: string[]) {
  await this.repo.save(...);
  // Invalidate all users in this tenant
  await this.accessControl.invalidateAuthContext(undefined, tenantId);
}
```

**T3: User Status Changes**
```typescript
// user.service.ts
async deactivateUser(userId: string) {
  await this.repo.update(userId, { isActive: false });
  // Invalidate all tenants for this user
  await this.accessControl.invalidateAuthContext(userId);
}
```

---

### 3.3 Cache Consistency Across Distributed Workers

**Current Setup:**
- Redis shared across all NestJS instances → consistent cache
- Cache invalidation via direct Redis operations

**Gap:** If app has 5 instances, invalidation on instance A doesn't notify instances B-E.

**Solution: Redis Pub/Sub Invalidation**

```typescript
// cache.service.ts
async invalidateWithBroadcast(entity: EntityCache, key: string) {
  await this.cacheManager.del(this.getFullKey({ entity, key }));
  await this.redisClient.publish('cache:invalidate', JSON.stringify({ entity, key }));
}

// Subscribe in onModuleInit
this.redisClient.subscribe('cache:invalidate');
this.redisClient.on('message', (channel, message) => {
  const { entity, key } = JSON.parse(message);
  this.cacheManager.del(this.getFullKey({ entity, key }));
});
```

**Benefits:**
- Invalidation propagates to all instances in <10ms
- No stale cache across instances
- Supports Redis Cluster deployments

---

### 3.4 Redis vs In-Memory Caching

**Current:** Redis (correct choice for multi-instance deployments)

**Alternatives Considered:**

**In-Memory (Node.js Map):**
- ❌ Lost on instance restart
- ❌ No cross-instance consistency
- ✅ Faster (~0.1ms vs ~2ms for Redis)
- **Use Case:** Single-instance dev environments only

**Hybrid (L1 in-memory + L2 Redis):**
- ✅ L1 hit: 0.1ms, L2 hit: 2ms, miss: 50ms
- ⚠️  Complexity: L1 invalidation requires Pub/Sub
- **Recommendation:** Defer until profiling shows Redis latency as bottleneck (unlikely)

---

### 3.5 TTL Strategies

**Current:** Fixed 24h TTL (too long)

**Recommended TTL Strategy:**

| Cache Layer | TTL | Rationale |
|-------------|-----|-----------|
| Auth Context | 15 min | Balance security (permission changes) vs load |
| Role Definitions | 1 hour | Roles change infrequently |
| Tenant Config | 30 min | Tenant settings semi-stable |
| Distribution Ownership | No cache | Query per request (indexed, 1-2ms) |

**Adaptive TTL (future):**
- Monitor cache hit rate per entity
- If hit rate < 80%, increase TTL
- If invalidation rate > 10% of reads, decrease TTL

---

## 4. Audit & Compliance Requirements

### 4.1 Authorization Audit Logging

**Current State:** No authorization audit logs found in codebase.

**Gap Analysis:**

**G1: Missing Authorization Decision Logs**
- No logging of permission checks in `PolicyGuard`
- No logging of cache hits/misses in `AccessControlService`
- No failed authorization attempt tracking

**G2: Missing Resource Access Logs**
- Distribution timeline access not logged
- SSE connection establishment not logged
- No correlation between user action → distribution resource

---

### 4.2 SOC2 Type II Requirements

**Trust Service Criteria Mapping:**

**CC6.1 — System Operations:**
- ✅ Changes tracked: Role/permission mutations exist
- ❌ Audit trail missing: No authorization decision logs

**CC6.2 — System Monitoring:**
- ⚠️  Partial: Request tracking exists (`request-tracking.service.ts`) but not linked to authorization

**CC7.2 — Security Monitoring:**
- ❌ Failed authorization attempts not logged
- ❌ No alerting on suspicious permission changes

**Recommendations:**

**R1: Authorization Audit Log Structure**
```typescript
interface AuthorizationAuditLog {
  timestamp: Date;
  userId: string;
  tenantId: string;
  resource: string; // e.g., "distribution:abc-123"
  action: string;   // e.g., "timeline:read"
  decision: 'allow' | 'deny';
  reason?: string;  // e.g., "missing permission: DISTRIBUTION_READ"
  ipAddress: string;
  userAgent: string;
}
```

**R2: Implementation Points**
```typescript
// In PolicyGuard.canActivate()
async canActivate(context: ExecutionContext): boolean {
  const allowed = /* ...existing logic... */;
  
  await this.auditService.logAuthorization({
    userId: user.id,
    tenantId: user.tenantId,
    resource: `${req.method} ${req.url}`,
    decision: allowed ? 'allow' : 'deny',
    reason: allowed ? undefined : 'insufficient permissions',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  
  return allowed;
}
```

**R3: Storage**
- **Hot storage:** Postgres table `authorization_audit_log` (90 days retention)
- **Cold storage:** Archive to S3/GCS after 90 days (7 years retention for compliance)
- **Index:** `(timestamp, userId, decision)` for incident investigation

---

### 4.3 ISO 27001:2022 Controls

**A.8.2.4 — User Registration and De-registration:**
- ✅ Implemented: `user.service.ts` handles user lifecycle
- ⚠️  Missing: Audit log of permission grants/revokes

**A.8.3.1 — User Access Reviews:**
- ❌ Not implemented: No periodic access review workflow
- **Recommendation:** Quarterly report of users with elevated permissions (OWNER, ADMIN)

**A.8.3.2 — Access Rights Review:**
- ⚠️  Partial: `getUserRoles()`, `getUserPermissions()` exist but no review tracking
- **Recommendation:** Add `last_reviewed_at` timestamp to `user_roles` table

**A.8.3.3 — Privileged Access Management:**
- ✅ System admin (`UserType.ADMIN`) isolated
- ⚠️  Missing: MFA enforcement for privileged users
- ⚠️  Missing: Privileged action logging (role changes, permission grants)

**A.9.4.3 — User Activity Logging:**
- ⚠️  Partial: Request tracking exists, authorization tracking missing

**A.9.4.4 — Log Protection:**
- ❓ Unknown: Audit log immutability not verified
- **Recommendation:** Use append-only table or write to immutable storage (S3 with versioning)

---

### 4.4 Compliance Implementation Checklist

**Phase 4 Must-Have (blocking release):**
- [ ] Add resource ownership check to distribution endpoints (IDOR fix)
- [ ] Add SSE connection authorization + event filtering
- [ ] Reduce auth cache TTL to 15 minutes
- [ ] Fix Redis `KEYS` usage → `SCAN` in `delByPrefix`

**Phase 4 Should-Have (post-MVP):**
- [ ] Implement authorization audit logging
- [ ] Add Redis Pub/Sub invalidation for multi-instance consistency
- [ ] Create `authorization_audit_log` table with 90-day retention
- [ ] Add failed authorization attempt monitoring

**Future (Phase 5+):**
- [ ] Implement periodic access review workflow (quarterly)
- [ ] Add MFA enforcement for privileged users
- [ ] Create compliance dashboard (access reviews, audit log stats)
- [ ] Implement log archival to cold storage (S3/GCS)

---

## 5. Mitigation Strategies

### 5.1 Immediate Actions (Phase 4 Critical Path)

**M1: Distribution Resource Authorization**
**Priority:** P0 (security vulnerability)  
**Effort:** 2-4 hours

```typescript
// Add to distribution.controller.ts
private async validateDistributionAccess(
  distributionId: string, 
  tenantId: string
): Promise<void> {
  const dist = await this.distributionQuery.getBasicInfo(distributionId);
  if (!dist || dist.tenantId !== tenantId) {
    throw new ForbiddenException('Distribution not found or access denied');
  }
}

@Get(':id/timeline')
async getTimeline(@Param('id') id: string, @User() user: UserReq, @Query() query) {
  await this.validateDistributionAccess(id, user.tenantId);
  // ... existing logic
}

@Sse(':id/stream')
async streamEvents(@Param('id') id: string, @User() user: UserReq, @Res() res: Response) {
  await this.validateDistributionAccess(id, user.tenantId);
  const level = user.type === UserType.ADMIN ? undefined : 'milestone';
  // ... existing logic with level filtering
}
```

**M2: SSE Connection TTL**
**Priority:** P1 (security hardening)  
**Effort:** 1 hour

```typescript
const MAX_CONNECTION_MS = 3600_000; // 1 hour
const timeout = setTimeout(() => {
  this.logger.log(`SSE connection expired for distribution ${id}`);
  response.end();
}, MAX_CONNECTION_MS);

response.on('close', () => {
  clearTimeout(timeout);
  this.sseService.cleanup(id);
});
```

**M3: Cache TTL Reduction**
**Priority:** P1 (security hardening)  
**Effort:** 30 minutes

```typescript
// Change in access-control.service.ts
const AUTH_CACHE_TTL = 900_000; // 15 minutes (was 24h)
```

**M4: Fix Redis KEYS Usage**
**Priority:** P2 (performance/stability)  
**Effort:** 2 hours

```typescript
// In cache.service.ts
async delByPrefix(input: { entity: EntityCache; prefix: string }): Promise<void> {
  const store = (this.cacheManager as any).store;
  if (!store?.getClient) return;

  const client = store.getClient();
  const pattern = `${input.entity}_${input.prefix}`;
  
  let cursor = '0';
  const keysToDelete: string[] = [];
  
  do {
    const [newCursor, keys] = await client.scan(
      cursor,
      'MATCH', pattern,
      'COUNT', 100
    );
    cursor = newCursor;
    keysToDelete.push(...keys);
  } while (cursor !== '0');

  if (keysToDelete.length > 0) {
    await client.del(...keysToDelete);
  }
}
```

---

### 5.2 Short-Term Hardening (Phase 4 Post-MVP)

**H1: Authorization Audit Logging**
**Priority:** P1 (compliance)  
**Effort:** 1 day

1. Create migration: `authorization_audit_log` table
2. Create `AuditService` with `logAuthorization()` method
3. Inject into `PolicyGuard`, log all decisions
4. Create admin endpoint: `GET /admin/audit-logs`

**H2: Role/Permission Change Invalidation**
**Priority:** P2 (cache consistency)  
**Effort:** 4 hours

Add invalidation calls in:
- `role.service.ts:updateRolePermissions()`
- `tenant-roles.service.ts:updateEnabledRoles()`
- `permission.service.ts:update()` (if exists)

**H3: Redis Pub/Sub Invalidation**
**Priority:** P2 (multi-instance consistency)  
**Effort:** 1 day

Implement broadcast invalidation pattern (see section 3.3).

---

### 5.3 Long-Term Improvements (Phase 5+)

**L1: Attribute-Based Access Control (ABAC)**
- Move from role-based to attribute-based (user.tier, distribution.status, tenant.plan)
- Use policy engine (Rego, Cedar, Casbin)
- **Benefit:** Fine-grained authorization (e.g., "EDITOR can edit distributions in DRAFT state only")

**L2: Permission Caching at Gateway**
- Cache permission checks in API Gateway (Kong, Envoy)
- **Benefit:** Offload authorization from app servers

**L3: Real-Time Permission Sync**
- Use database triggers + CDC (Change Data Capture) to detect permission changes
- **Benefit:** Faster invalidation than polling

**L4: Zero-Trust Architecture**
- Re-validate permissions on every internal service call
- **Benefit:** Defense in depth; prevents lateral movement if one service compromised

---

## 6. Performance Benchmarking Plan

### 6.1 Baseline Metrics (Pre-Phase 4)

**Measure:**
- P50/P95/P99 latency for `GET /distributions/:id/timeline`
- Auth cache hit rate (Redis `INFO stats`)
- Database query time for permission resolution

**Tools:**
- Artillery/k6 for load testing
- Datadog/New Relic APM for tracing
- `EXPLAIN ANALYZE` for Postgres queries

**Target Baseline:**
- P50 < 50ms, P95 < 200ms, P99 < 500ms
- Cache hit rate > 90%

---

### 6.2 Phase 4 Impact Testing

**Test Scenarios:**

**T1: Distribution Ownership Check Impact**
- Load test `GET /distributions/:id/timeline` with 1000 req/sec
- Measure latency increase after adding ownership validation
- **Acceptance:** P95 increase < 10ms

**T2: SSE Connection Scaling**
- Open 10K concurrent SSE connections
- Push 10 events/sec to random distributions
- Measure: CPU usage, memory usage, event delivery latency
- **Acceptance:** <80% CPU, <2GB memory, <100ms delivery latency

**T3: Cache Invalidation Storm**
- Simulate admin changing role permissions (invalidates 1000 users)
- Measure: DB load spike, cache rebuild time, request latency during rebuild
- **Acceptance:** P99 < 1s during invalidation storm

**T4: Redis SCAN Performance**
- Invalidate all auth contexts for a tenant (pattern `*_{tenantId}`)
- Measure: Time to scan + delete 10K keys
- **Acceptance:** <5 seconds for 10K keys

---

### 6.3 Monitoring & Alerts

**Metrics to Track (Production):**
- Authorization decisions/sec (allow, deny)
- Authorization decision latency (P50/P95/P99)
- Auth cache hit rate
- Redis operation latency (GET, SET, DEL, SCAN)
- SSE active connections per tenant
- Failed authorization attempts/min

**Alerts:**
- Auth cache hit rate < 80% → investigate cache invalidation frequency
- Authorization latency P95 > 100ms → investigate DB query performance
- Failed authorization spike > 10/min → potential attack
- SSE connections > 1000 per tenant → resource exhaustion risk

---

## 7. Risk Assessment Summary

| Risk | Severity | Likelihood | Impact | Mitigation | Priority |
|------|----------|------------|--------|------------|----------|
| IDOR on distribution resources | HIGH | HIGH | Data leak | M1: Add ownership check | P0 |
| SSE authorization bypass | HIGH | MEDIUM | Data leak | M1: Add SSE auth | P0 |
| JWT permission staleness | MEDIUM | MEDIUM | Privilege escalation | M3: Reduce TTL | P1 |
| Cache invalidation gaps | MEDIUM | HIGH | Stale permissions | H2: Add triggers | P2 |
| Redis KEYS blocking | MEDIUM | LOW | Service degradation | M4: Use SCAN | P2 |
| No audit logging | LOW | HIGH | Compliance failure | H1: Add audit logs | P1 |
| SSE token expiry | LOW | MEDIUM | UX degradation | M2: Add TTL | P1 |
| Multi-instance cache drift | LOW | MEDIUM | Inconsistent auth | H3: Add Pub/Sub | P2 |

**Overall Risk Level:** MEDIUM-HIGH (due to P0 IDOR vulnerability)

---

## 8. Recommendations Summary

### Must-Fix Before Production (P0)
1. ✅ Add `tenantId` ownership check to all distribution endpoints
2. ✅ Add SSE connection authorization with user context
3. ✅ Implement event filtering by user level (admin vs milestone)

### Should-Fix in Phase 4 (P1)
4. ✅ Reduce auth cache TTL to 15 minutes
5. ✅ Add SSE connection max TTL (1 hour)
6. ✅ Implement authorization audit logging
7. ✅ Fix Redis `KEYS` → `SCAN` for prefix deletion

### Can-Defer to Phase 5 (P2)
8. ⚠️  Add Redis Pub/Sub for multi-instance invalidation
9. ⚠️  Add role/permission change invalidation triggers
10. ⚠️  Implement periodic access review workflow
11. ⚠️  Add MFA for privileged users

### Performance Optimizations (as needed)
12. 📊 Benchmark distribution ownership query impact
13. 📊 Load test SSE scaling to 10K connections
14. 📊 Profile cache invalidation storm scenarios

---

## 9. Next Steps

1. **Immediate (Today):**
   - Share report with Phase 4 implementation team
   - Create JIRA tickets for P0 security fixes
   - Schedule security review meeting

2. **This Week:**
   - Implement M1 (distribution ownership check)
   - Implement M2 (SSE connection TTL)
   - Implement M3 (cache TTL reduction)
   - Write integration tests for authorization checks

3. **Next Sprint:**
   - Implement H1 (audit logging)
   - Implement M4 (Redis SCAN fix)
   - Run performance benchmarks (section 6)
   - Document ACL architecture for Phase 4

4. **Future Sprints:**
   - Implement H2 (invalidation triggers)
   - Implement H3 (Redis Pub/Sub)
   - SOC2 compliance audit prep

---

## 10. References & Research Sources

**Security Research:**
- NestJS authorization vulnerabilities and IDOR prevention best practices (web search: general security patterns, no specific 2025 vulnerabilities found)
- TOCTOU attack prevention strategies for distributed systems
- SSE security patterns and JWT token handling for long-lived connections

**Performance & Caching:**
- Redis permission caching patterns and invalidation strategies for distributed systems (2025 best practices)
- Hierarchical cache invalidation and tag-based approaches
- Event-driven invalidation vs TTL-based strategies

**Compliance:**
- SOC2 Type II Trust Service Criteria (CC6.1, CC6.2, CC7.2) for authorization audit requirements
- ISO/IEC 27001:2022 controls (A.8.2.4, A.8.3.x, A.9.4.3, A.9.4.4) for access control and logging

**Code Analysis:**
- Current ACL implementation: `src/modules/access-control/access-control.service.ts`
- Policy guard: `src/modules/auth/guards/policy.guard.ts`
- SSE service: `src/modules/distribution-orchestration/infrastructure/sse/distribution-sse.service.ts`
- Distribution controller: `src/modules/distribution-orchestration/infrastructure/http/distribution.controller.ts`
- Cache service: `src/modules/cache/cache.service.ts`

**Architecture References:**
- Phase 4 plan: `E:/CODE/ag-release/ag-release-server/plans/260713-distribution-vnext/phase-04-integration-acl.md`
- Phase 3 SSE implementation: `E:/CODE/ag-release/ag-release-server/plans/260713-distribution-vnext/phase-03-outbox-timeline.md`
- Distribution v-next memory documents: `distribution-vnext-architecture.md`, `distribution-vnext-phase1-progress.md`, `distribution-vnext-phase2-progress.md`

---

**Report Completed:** 2026-07-20 09:45 UTC  
**Agent:** general-purpose (research specialist)  
**Report Location:** `E:/CODE/ag-release/ag-release-server/plans/reports/researcher-security-performance-20260720-094506.md`