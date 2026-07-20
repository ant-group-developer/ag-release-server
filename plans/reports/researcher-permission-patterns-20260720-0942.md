# Permission Checking Patterns Research — Distribution v-next Phase 4

**Research Date:** 2026-07-20  
**Context:** Distribution v-next Phase 4 Integration & ACL  
**Purpose:** Analyze permission patterns for HTTP endpoints, CQRS handlers, BullMQ jobs, SSE streams

---

## Executive Summary

Codebase uses **decorator-based guard pattern** (NestJS guards) for HTTP layer authorization. Domain/application layer (CQRS) has **NO built-in authorization** — command/query handlers trust caller. BullMQ jobs currently **lack user context propagation**. SSE streams have **connection-time auth only**, no per-event filtering.

**Key Finding:** Current pattern = **perimeter defense** (HTTP guards) + **trusted internal boundary**. Distribution v-next will need **explicit ACL checks** if commands can be triggered from multiple entry points (HTTP, jobs, internal services).

---

## 1. NestJS HTTP Authorization Patterns

### 1.1 Guard Architecture

**Stack:** `JwtAuthGuard` (authentication) → `PolicyGuard` (authorization)

- **JwtAuthGuard** (`src/modules/auth/guards/jwt-auth.guard.ts`):
  - Extends `@nestjs/passport` AuthGuard('jwt')
  - Validates JWT via JwtStrategy → enriches `req.user` with `UserReq` interface
  - Supports API key fallback (`x-api-key` header for internal services)
  - Skips auth for `@PublicRoute()` decorated endpoints

- **PolicyGuard** (`src/modules/auth/guards/policy.guard.ts`):
  - Reflects metadata from decorators: `@RequirePermissions()`, `@SystemAdminOnly()`, `@TenantOwnerOnly()`, etc.
  - Implements hierarchy: System admins bypass all checks → Permission checks (ANY-of) → Tenant role checks
  - Throws `ResponseError` with descriptive messages on failure

**Applied via module-level APP_GUARD:**
```typescript
// Global registration pattern (inferred from usage)
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: PolicyGuard },
]
```

### 1.2 Authorization Decorators

**Location:** `src/modules/auth/decorators/auth.decorator.ts`

```typescript
@RequirePermissions(...perms: Permission[])  // ANY-of permission check
@SystemAdminOnly()                           // System admin gate
@TenantOwnerOnly()                           // Tenant owner gate
@TenantOwnerOrAdminOnly()                    // Tenant owner OR admin
@TenantWhiteLabelOnly()                      // Tenant type = white_label
@PublicRoute()                               // Skip auth entirely
```

**Permission Model:** String tokens (e.g., `'release_audio.create'`, `'dsp.configure_integration'`)

### 1.3 User Context Enrichment

**JwtStrategy validation** (`src/modules/token/token.strategy.ts`):
- Calls `AccessControlService.getAuthContext(userId, tenantId)` — **Redis-cached** (24h TTL)
- Merges JWT claims + DB-resolved permissions + tenant metadata → `req.user: UserReq`

**UserReq Interface** (`src/common/interface/common.interface.ts`):
```typescript
interface UserReq {
  sub: string;              // User ID from JWT
  id: string;               // Same as sub
  email: string;
  name: string;
  isActive: boolean;
  type: UserType;           // system_admin | admin | user
  tenantId: string;
  tenantType: TenantType;   // system | white_label | standard
  tenantUserType: TenantUserType; // owner | admin | member
  permission: string[];     // Resolved permission codes
}
```

### 1.4 Example: Distribution SFTP Controller

**Source:** `src/modules/distribution/sftp-configs/sftp-config.controller.ts`

```typescript
@ApiTags('SftpConfigs')
@SystemAdminOnly()  // ← Controller-level gate
@Controller('distribution/sftp-configs')
export class SftpConfigsController {
  @Post()
  async create(@Body() data: CreateSftpConfigDto, @User() user: UserReq) {
    // user.id, user.tenantId available — pre-validated by guards
    return this.svc.upsert({ data, userId: user.id });
  }
}
```

---

## 2. Domain Layer Authorization (CQRS/DDD)

### 2.1 Current State: NO Authorization in Handlers

**Distribution Orchestrate Handler** (`src/modules/distribution-orchestration/application/orchestrate.handler.ts`):
- Handles 10 command types (SUBMIT, MARK_VALIDATED, APPROVE_REVIEW, etc.)
- **NO user context** in command payload
- **NO permission checks** in handler
- **Trusts caller** — assumes HTTP guard already validated

**Pattern:** Commands are **anemic DTOs** with no auth context:
```typescript
interface DistributionCommand {
  type: 'SUBMIT' | 'MARK_VALIDATED' | ...;
  distributionId: string;
  key: string; // idempotency key
  // NO userId, NO tenantId, NO permissions
}
```

### 2.2 Implications for Multi-Entry-Point Commands

**Risk:** If commands can be triggered from:
1. HTTP endpoint (guarded)
2. BullMQ job (no guard)
3. Internal service call (no guard)
4. Admin tooling (bypass guard)

→ **Authorization bypass** if only HTTP layer has checks.

### 2.3 Options for Domain-Layer Authorization

**Option A: Enrich commands with auth context**
```typescript
interface DistributionCommand {
  type: string;
  distributionId: string;
  actor: {
    userId: string;
    tenantId: string;
    permissions: string[];
  };
}
```
- **Pros:** Handler can enforce ACL regardless of entry point
- **Cons:** Domain layer couples to auth concepts; commands grow larger

**Option B: Authorization service injected into handler**
```typescript
class OrchestrateHandler {
  constructor(
    private readonly authz: AuthorizationService,
  ) {}
  
  async handle(cmd: DistributionCommand, actorId: string) {
    await this.authz.requirePermission(actorId, 'distribution.submit');
    // ... domain logic
  }
}
```
- **Pros:** Separation of concerns; commands stay anemic
- **Cons:** Handler must be called with `actorId` from all entry points

**Option C: Keep perimeter defense, add audit trail**
- HTTP guards enforce; domain logs `actorId` in events
- **Pros:** Simple; works if jobs only triggered by authorized HTTP calls
- **Cons:** Vulnerable if jobs can be triggered externally

---

## 3. Background Job Authorization (BullMQ)

### 3.1 Current State: NO User Context in Jobs

**Outbox Relay** (`src/modules/distribution-orchestration/infrastructure/relay/outbox-relay.ts`):
- Polls outbox table, enqueues jobs to BullMQ
- Job payload: `{ distributionId, correlationId, key }` — **NO userId**

**Job Processors** (Phase 2 spec):
- `dist.orchestrate` queue → calls `OrchestrateHandler.handle(command)`
- `dist.provision-id`, `dist.build-package`, etc. → step runners
- **NO authorization checks** in processors

### 3.2 Patterns for Job Authorization

**Pattern A: Store userId in job payload**
```typescript
interface JobPayload {
  distributionId: string;
  initiatedBy: {
    userId: string;
    tenantId: string;
    timestamp: Date;
  };
}
```
- Job processor checks: "Can this user still access this distribution?"
- Handles permission revocation during long-running jobs

**Pattern B: System-level job execution**
- Jobs run with "system" authority (bypass ACL)
- Authorization checked at **enqueue time** (HTTP endpoint)
- **Audit trail:** log `initiatedBy` but don't check permissions
- **Risk:** Permission changes after job starts not enforced

**Pattern C: Token-based authorization**
- Include short-lived JWT in job payload
- Job processor validates token before executing
- **Cons:** Token may expire for long-running jobs (minutes/hours)

### 3.3 Recommendation for Distribution v-next

**Hybrid approach:**
1. **Enqueue-time authorization:** HTTP endpoint checks permissions before creating distribution + enqueuing first command
2. **Job payload includes `initiatedBy`:** Store `{ userId, tenantId, timestamp }` in Distribution aggregate metadata
3. **System execution mode:** Jobs run with system authority (no per-step ACL checks)
4. **Audit trail:** All events include `actorId` for forensics
5. **Permission changes:** If user loses access, **cannot submit new commands** via HTTP, but **in-flight jobs continue**

**Rationale:** Distribution is a long-running workflow (minutes to hours). Permission checks at **workflow initiation** (HTTP submit) provide security; rechecking on every BullMQ job step adds complexity for marginal gain.

---

## 4. SSE/Real-time Authorization

### 4.1 Current Implementation

**Distribution SSE** (`src/modules/distribution-orchestration/infrastructure/http/distribution.controller.ts`):
```typescript
@Sse(':id/stream')
streamEvents(@Param('id') id: string, @Res() response: Response) {
  // NO explicit authorization check — relies on global guards
  const stream = this.sseService.getOrCreateStream(id);
  response.on('close', () => this.sseService.cleanup(id));
  return stream;
}
```

**Authorization:**
- `JwtAuthGuard` + `PolicyGuard` applied globally → validates `req.user` before method execution
- **NO per-distribution ACL check** — any authenticated user can subscribe to any distribution stream
- **NO event filtering** based on user role/permissions

### 4.2 SSE Service Architecture

**Source:** `src/modules/distribution-orchestration/infrastructure/sse/distribution-sse.service.ts`

**Pattern:** In-memory `Map<distributionId, Subject<MessageEvent>>`
- `getOrCreateStream(id)` → returns `Observable<MessageEvent>`
- `pushEvent(id, event)` → broadcasts to all subscribers on that distribution
- **Heartbeat:** 30s interval keepalive (prevents reverse proxy timeout)
- **Cleanup:** `response.on('close')` removes Subject from Map

**EventEmitter2 Integration:**
```typescript
@OnEvent(DISTRIBUTION_EVENT_SAVED)
handleEventSaved(payload: { distributionId, event }) {
  this.pushEvent(payload.distributionId, payload.event);
}
```

### 4.3 Event Filtering by User Role

**Analytics Export SSE** (`src/modules/analytics/controllers/analytics-report-export.controller.ts`):
```typescript
@Sse('export/:jobId/events')
streamExportEvents(@Req() req: Request, @Param('jobId') jobId: string) {
  // 1. Connection-time authorization
  const job = await this.importJobsService.findById(jobId);
  this.assertReadableJob(job, req.user!.tenantId, jobId);
  
  // 2. Stream events
  return this.jobEvents.subscribe(jobId).pipe(/* ... */);
}

private assertReadableJob(job: ImportJob | null, tenantId: string, jobId: string) {
  if (!job) throw new NotFoundException(`Export job not found: ${jobId}`);
  // System tenant can read any job; normal tenants only their own
  if (!checkIsSystemTenant(tenantId) && job.tenantId !== tenantId) {
    throw new NotFoundException(`Export job not found: ${jobId}`);
  }
}
```

**Pattern:** Connection-time ownership check + event broadcast (no per-event filtering)

### 4.4 Recommended SSE Authorization for Distribution

**Level 1: Connection-time ACL check**
```typescript
@Sse(':id/stream')
async streamEvents(@Param('id') id: string, @User() user: UserReq, @Res() res: Response) {
  // Check user can access this distribution
  const dist = await this.repo.findOne(id);
  if (!dist) throw new NotFoundException();
  if (dist.tenantId !== user.tenantId && user.type !== UserType.ADMIN) {
    throw new ForbiddenException();
  }
  
  const stream = this.sseService.getOrCreateStream(id);
  res.on('close', () => this.sseService.cleanup(id));
  return stream;
}
```

**Level 2: Event-level filtering (optional)**
```typescript
// In SSE service
getOrCreateStream(distributionId: string, userRole: UserType): Observable<MessageEvent> {
  const events$ = this.streams.get(distributionId)!.pipe(
    filter(event => this.isVisibleTo(event, userRole))
  );
  // Admin: all events. User: milestone only.
}
```

**Level 3: Dynamic permission checks (NOT recommended)**
- Re-validate `req.user` permissions on every event push
- **Problem:** SSE connections last minutes/hours; JWT may expire
- **Alternative:** WebSocket with token refresh, or accept stale permissions for SSE duration

### 4.5 Token Expiration Handling

**Current JWT TTL:** Likely 1-24 hours (not found in code, check `.env`)

**Options:**
1. **Accept stale permissions:** SSE connection inherits permissions from connection time; valid until disconnect
2. **Periodic re-auth:** Client closes SSE, refreshes token, reconnects (UX friction)
3. **Server-side permission change detection:** Invalidate SSE stream when user permissions change (complex)

**Recommendation:** **Option 1** (stale permissions) — SSE is read-only, low risk. If user loses access, they see stale data until disconnect/reconnect.

---

## 5. Permission Model Analysis

### 5.1 Permission Constants

**Source:** `src/modules/permission/constants/permission.data.constant.ts`

**Existing release permissions:**
```typescript
RELEASE_AUDIO: {
  REVIEW: 'release_audio.review',
  CREATE: 'release_audio.create',
  READ: 'release_audio.read',
  TAKE_DOWN: 'release_audio.take_down',
  UPDATE: 'release_audio.update',
  DELETE: 'release_audio.delete',
}
```

**Missing distribution-specific permissions** — Phase 4 should add:
```typescript
DISTRIBUTION: {
  SUBMIT: 'distribution.submit',
  READ: 'distribution.read',
  REVIEW: 'distribution.review',
  APPROVE: 'distribution.approve',
  REJECT: 'distribution.reject',
  RETRY: 'distribution.retry',
  TAKE_DOWN: 'distribution.take_down',
  VIEW_TIMELINE: 'distribution.view_timeline',      // Granular read
  VIEW_ADMIN_EVENTS: 'distribution.view_admin_events', // Admin-only events
}
```

### 5.2 Permission Resolution

**AccessControlService** (`src/modules/access-control/access-control.service.ts`):
- `getAuthContext(userId, tenantId)` → Redis-cached 24h
- Resolves: User roles → Role permissions → Permission codes → `string[]`
- **Cache invalidation:** `invalidateAuthContext(userId?, tenantId?)` — called when roles/permissions change

**Performance:** Redis cache = O(1) lookup. Safe for per-request use.

---

## 6. Code Examples from Codebase

### 6.1 Controller with Permission Decorator

```typescript
// src/modules/distribution/sftp-configs/sftp-config.controller.ts
@ApiTags('SftpConfigs')
@SystemAdminOnly()  // ← All endpoints require system admin
@Controller('distribution/sftp-configs')
export class SftpConfigsController {
  @Post()
  async create(@Body() data: CreateSftpConfigDto, @User() user: UserReq) {
    const result = await this.svc.upsert({ data, userId: user.id });
    return SftpConfigSuccess.COMMON(result);
  }
}
```

### 6.2 PolicyGuard Implementation (Excerpt)

```typescript
// src/modules/auth/guards/policy.guard.ts
@Injectable()
export class PolicyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) throw new ResponseError(AuthMessages.UNAUTHORIZED);

    const isSysAdmin = checkIsSystemAdmin(user.type);

    // System admins bypass remaining checks
    if (isSysAdmin) return true;

    // Permissions (ANY-of)
    const requiredPerms = this.reflector.getAllAndOverride<Permission[]>(...);
    if (requiredPerms.length) {
      const userPerms = new Set<string>(user.permission);
      const hasAny = requiredPerms.some(p => userPerms.has(p));
      if (!hasAny) throw new ResponseError(buildInsufficientPermissionsMessage(...));
    }

    // Tenant gates
    if (tenantOwnerOnly) {
      const ok = checkIsTenantOwner(user.tenantUserType);
      if (!ok) throw new ResponseError(AuthMessages.TENANT_OWNER_ONLY);
    }

    return true;
  }
}
```

### 6.3 Distribution Timeline Query (No ACL)

```typescript
// src/modules/distribution-orchestration/infrastructure/http/distribution.controller.ts
@Get(':id/timeline')
async getTimeline(
  @Param('id', ParseUUIDPipe) id: string,
  @Query() query: TimelineQueryDto,
  @User() user: UserReq,
) {
  // Event level filtering based on user type (NOT permission)
  const level = user?.type === UserType.ADMIN ? undefined : 'milestone';
  
  const result = await this.timelineQuery.getTimeline({
    distributionId: id,
    level,
    cursor: query.cursor,
    limit: query.limit,
  });

  return AppResponseSuccess.COMMON(result);
}
```

**Note:** No check if `user.tenantId === distribution.tenantId` — potential cross-tenant access issue.

---

## 7. Recommendations for Distribution v-next Phase 4

### 7.1 HTTP Layer Authorization

**Add distribution-specific permissions:**
```typescript
// New permissions in permission.data.constant.ts
DISTRIBUTION: {
  SUBMIT: 'distribution.submit',
  READ: 'distribution.read',
  REVIEW: 'distribution.review',
  APPROVE: 'distribution.approve',
  REJECT: 'distribution.reject',
  RETRY: 'distribution.retry',
  TAKE_DOWN: 'distribution.take_down',
}
```

**Controller decoration:**
```typescript
@Controller('distributions')
export class DistributionController {
  @Post()
  @RequirePermissions(Permission.DISTRIBUTION.SUBMIT)
  async submit(@Body() dto: SubmitDto, @User() user: UserReq) {
    // Tenant isolation check
    if (dto.tenantId !== user.tenantId && user.type !== UserType.ADMIN) {
      throw new ForbiddenException();
    }
    
    return this.commandBus.execute(
      new SubmitDistributionCommand({
        ...dto,
        initiatedBy: { userId: user.id, tenantId: user.tenantId },
      })
    );
  }

  @Get(':id/timeline')
  @RequirePermissions(Permission.DISTRIBUTION.READ)
  async getTimeline(@Param('id') id: string, @User() user: UserReq) {
    // Ownership check
    const dist = await this.repo.findOne(id);
    if (!dist) throw new NotFoundException();
    if (dist.tenantId !== user.tenantId && user.type !== UserType.ADMIN) {
      throw new ForbiddenException();
    }
    
    return this.queryService.getTimeline(id, user);
  }
}
```

### 7.2 Domain Layer Authorization

**Enrich Distribution aggregate metadata:**
```typescript
class Distribution {
  readonly id: string;
  readonly tenantId: string;
  readonly initiatedBy: {
    userId: string;
    tenantId: string;
    timestamp: Date;
  };
  // ... domain fields
}
```

**Command handlers remain authorization-free:**
- Trust HTTP layer enforced permissions
- Log `initiatedBy` in events for audit

**Alternative (if commands from multiple sources):**
```typescript
class OrchestrateHandler {
  async handle(cmd: DistributionCommand, actorId: string) {
    // Optional: verify actorId can access distribution
    const dist = await this.repo.load(cmd.distributionId);
    if (dist.tenantId !== actorTenantId && !isSystemAdmin(actorId)) {
      throw new ForbiddenException();
    }
    // ... apply command
  }
}
```

### 7.3 BullMQ Job Authorization

**Pattern:** Enqueue-time authorization + audit trail

**1. HTTP endpoint checks permission:**
```typescript
@Post()
@RequirePermissions(Permission.DISTRIBUTION.SUBMIT)
async submit(@Body() dto: SubmitDto, @User() user: UserReq) {
  // Permission validated by guard
  const command = new SubmitDistributionCommand({
    ...dto,
    initiatedBy: { userId: user.id, tenantId: user.tenantId },
  });
  await this.commandBus.execute(command);
}
```

**2. Store initiator in aggregate:**
```typescript
class Distribution {
  static create(props: CreateProps) {
    const dist = new Distribution();
    dist.initiatedBy = props.initiatedBy; // { userId, tenantId, timestamp }
    dist.raise(new DistributionSubmittedEvent({ ...props }));
    return dist;
  }
}
```

**3. Jobs run with system authority:**
```typescript
// Job processor (no ACL check)
@Process('dist.orchestrate')
async processOrchestrate(job: Job<OrchestratePayload>) {
  // Trust that job was created by authorized action
  await this.handler.handle(job.data.command);
}
```

**4. Audit events include actorId:**
```typescript
interface DistributionEvent {
  distributionId: string;
  type: string;
  actorId: string;  // From dist.initiatedBy
  timestamp: Date;
  // ... event data
}
```

### 7.4 SSE Authorization

**Connection-time ownership check:**
```typescript
@Sse(':id/stream')
async streamEvents(@Param('id') id: string, @User() user: UserReq, @Res() res: Response) {
  // 1. Verify distribution exists and user has access
  const dist = await this.queryService.findById(id);
  if (!dist) throw new NotFoundException();
  
  // 2. Tenant isolation
  if (dist.tenantId !== user.tenantId && user.type !== UserType.ADMIN) {
    throw new ForbiddenException();
  }
  
  // 3. Stream events (filtered by user role)
  const stream = this.sseService.getOrCreateStream(id, user.type);
  res.on('close', () => this.sseService.cleanup(id));
  return stream;
}
```

**Event filtering in SSE service:**
```typescript
getOrCreateStream(distributionId: string, userType: UserType): Observable<MessageEvent> {
  const events$ = this.streams.get(distributionId)!.pipe(
    filter(event => {
      // Admin sees all events; users see milestone only
      if (userType === UserType.ADMIN) return true;
      return event.level === 'milestone';
    })
  );
  return merge(events$, this.heartbeat$);
}
```

### 7.5 Performance Considerations

**Redis-cached permissions:**
- `AccessControlService.getAuthContext(userId, tenantId)` — 24h TTL
- Safe for per-request validation
- Invalidate on role/permission changes via `invalidateAuthContext()`

**SSE connection limits:**
- Monitor active streams via `DistributionSseService.getMetrics()`
- Consider max connections per user (DDoS prevention)
- Heartbeat = 30s (keeps connections alive, but adds overhead)

**BullMQ job payload size:**
- Keep payloads small: `{ distributionId, correlationId, key, initiatedBy }`
- Store large data in Distribution aggregate, not job payload

---

## 8. Security Considerations

### 8.1 Cross-Tenant Access Prevention

**Risk:** User in Tenant A accesses distribution owned by Tenant B

**Mitigation:**
```typescript
// Always check tenant ownership
const dist = await this.repo.findOne(id);
if (dist.tenantId !== user.tenantId && user.type !== UserType.ADMIN) {
  throw new ForbiddenException();
}
```

**Automated check (interceptor pattern):**
```typescript
@Injectable()
export class TenantIsolationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const user: UserReq = req.user;
    const resourceTenantId = req.params.tenantId || req.body?.tenantId;
    
    if (resourceTenantId && resourceTenantId !== user.tenantId && user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    
    return next.handle();
  }
}
```

### 8.2 Permission Escalation Prevention

**Risk:** User upgrades own permissions via API

**Mitigation:**
- Permission/role changes require `@SystemAdminOnly()` or `@TenantOwnerOnly()`
- Redis cache invalidation on permission changes
- Audit log for permission changes

### 8.3 Job Replay Attacks

**Risk:** Attacker replays BullMQ job payload to bypass HTTP authorization

**Mitigation:**
- Jobs stored in outbox table (PostgreSQL) — DB access required
- BullMQ connection requires Redis credentials
- Internal network only (no public BullMQ exposure)
- Idempotency keys prevent duplicate execution

### 8.4 SSE Connection Hijacking

**Risk:** Attacker subscribes to another user's distribution stream

**Mitigation:**
- JWT validation on SSE connection (`@Sse` endpoints still protected by guards)
- Connection-time ownership check (see 7.4)
- HTTPS only (prevent token interception)

---

## 9. Unresolved Questions

1. **Distribution permission granularity:** Should permissions be per-action (`distribution.submit`, `distribution.approve`) or coarse-grained (`distribution.write`)? Recommendation: **Per-action** for better RBAC control.

2. **Multi-tenant distribution workflows:** Can a distribution span multiple tenants (e.g., white-label parent distributing on behalf of child)? If yes, ownership checks need parent-child traversal logic.

3. **Admin tooling authorization:** Will admins have a separate UI with elevated permissions? If yes, consider `@SystemAdminOnly()` + separate controller or query parameter (`?asAdmin=true`).

4. **Permission changes during in-flight jobs:** Should long-running distributions be canceled if initiator loses permissions? **Recommendation:** No — job continues (audit trail shows who initiated). Alternative: periodic permission re-check in job processor (complex).

5. **SSE token refresh:** Current JWT likely 1-24h TTL. SSE connections may last hours. Accept stale permissions, or force reconnect? **Recommendation:** Stale permissions acceptable (read-only stream).

6. **BullMQ job visibility:** Should users see job status in UI? If yes, add `GET /distributions/:id/jobs` endpoint with permission check.

---

## 10. Next Steps for Phase 4 Implementation

1. **Add distribution permissions** to `permission.data.constant.ts`
2. **Decorate controller methods** with `@RequirePermissions(...)`
3. **Add tenant isolation checks** in HTTP endpoints
4. **Enrich Distribution aggregate** with `initiatedBy` metadata
5. **Update SSE controller** with connection-time ownership check
6. **Add event filtering** in `DistributionSseService` (admin vs user)
7. **Write integration tests** for:
   - Cross-tenant access denial
   - Permission-based endpoint access
   - SSE connection authorization
   - Event filtering by user role
8. **Update API documentation** with permission requirements per endpoint
9. **Audit existing distribution module** for missing authorization checks

---

**End of Report**
