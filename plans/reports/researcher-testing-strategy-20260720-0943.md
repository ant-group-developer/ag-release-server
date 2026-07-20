# Testing Strategy — Distribution ACL Phase 4 Integration

**Research Date:** 2026-07-20  
**Context:** Phase 4 ACL adapter integration for distribution orchestration  
**Work Context:** E:\CODE\ag-release\ag-release-server

---

## Executive Summary

Current project uses **Jest + TypeScript** with 3 test layers:
1. **Unit tests** (pure domain logic, in-memory doubles)
2. **Integration tests** (testcontainers Postgres, real infra)
3. **E2E tests** (full flow simulation)

ACL Phase 4 requires **authorization testing at all 3 layers** covering permission checks, multi-tenant isolation, and security boundaries.

---

## Current Testing Infrastructure

### Test Framework Stack
- **Jest 29.7.0** + ts-jest for TypeScript
- **@testcontainers/postgresql 12.0.4** for integration tests
- **@nestjs/testing 11.0.1** for NestJS module testing
- **supertest 7.0.0** for HTTP endpoint testing

### Test Organization
```
src/modules/distribution-orchestration/
├── domain/__tests__/              # Pure domain unit tests (28 files total)
├── application/__tests__/         # Handler + orchestration tests
├── infrastructure/__tests__/      # Adapter integration tests
└── infrastructure/test-doubles/   # In-memory fakes for ports
```

### Existing Test Patterns

**1. Pure Domain Unit Tests** (`domain/__tests__/*.spec.ts`)
- Zero I/O, pure functions
- In-memory test doubles for all ports
- Fast execution (<1s for entire suite)
- Example: `distribution.aggregate.spec.ts`, `channel-delivery.entity.spec.ts`

**2. Integration Tests** (`*.integration.spec.ts`)
- Testcontainers for real Postgres
- Real TypeORM repositories
- Tests persistence, optimistic locking, transactions
- Example: `distribution.repository.integration.spec.ts` (90s timeout for container pull)

**3. E2E Tests** (`*.e2e.spec.ts`)
- Full flow: SUBMIT → VALIDATING → PROVISIONING → DELIVERED
- Simulates outbox relay + BullMQ job dispatch
- In-memory workflow adapter for isolation
- Example: `orchestrate.e2e.spec.ts`

### Test Double Strategy (Already Established)

`infrastructure/test-doubles/` contains in-memory implementations:
- `InMemoryUnitOfWork` (no-tx, passes through)
- `InMemoryDistributionRepository` (optimistic lock simulation)
- `InMemoryIdentifierProvisioner` (idempotent UPC/ISRC)
- `InMemoryPackageBuilder`, `InMemoryPackageUploader`
- `InMemoryQaChecker`, `InMemoryTicketService`
- `FixedClock` (deterministic timestamps)

**Pattern:** Test doubles implement port interfaces, maintain in-memory state, simulate idempotency + errors.

---

## Current Authentication/Authorization System

### Auth Stack
- **JWT via @nestjs/passport** + passport-jwt
- **Guards:** `JwtAuthGuard` (authentication) → `PolicyGuard` (authorization)
- **Decorators:** `@RequirePermissions(...)`, `@SystemAdminOnly()`, `@TenantOwnerOnly()`, etc.

### Authorization Model
```typescript
// User context injected by JwtAuthGuard
req.user = {
  id: string,
  type: 'system_admin' | 'tenant_user',
  tenantId: string | null,
  tenantUserType: 'owner' | 'admin' | 'member',
  permission: string[]  // e.g., ['release:write', 'distribution:read']
}
```

### Permission Enforcement (PolicyGuard)
1. **Public routes** → bypass (via `@PublicRoute()`)
2. **System admin** → bypass all permission checks
3. **Permission checks** → ANY-of semantics (need at least 1 matching permission)
4. **Tenant gates** → owner/admin/white-label checks
5. **Multi-tenant isolation** → enforced via `tenantId` filtering in service layer

### API Key Auth (Alternative Path)
- Header: `x-api-key` with `INTERNAL_API_KEY`
- Grants `internal:*` permission (system-level)
- Used for service-to-service calls

---

## Test Coverage Requirements for ACL Phase 4

### 1. Permission Matrix Testing

**Scope:** Verify authorization rules for distribution orchestration endpoints

**Test Cases:**

| User Type | Permission | Endpoint | Expected |
|-----------|-----------|----------|----------|
| System Admin | (any) | POST /distributions | ✅ Allow |
| Tenant Owner | `distribution:write` | POST /distributions | ✅ Allow |
| Tenant Member | `distribution:write` | POST /distributions | ✅ Allow |
| Tenant Member | `distribution:read` | POST /distributions | ❌ Deny (403) |
| No Auth | (none) | POST /distributions | ❌ Deny (401) |
| Tenant A User | `distribution:write` | GET /distributions?tenantId=B | ❌ Deny (filter) |
| API Key | `internal:*` | POST /distributions | ✅ Allow |

**Boundaries to Test:**
- ✅ Positive: user HAS required permission → allow
- ❌ Negative: user LACKS permission → 403 Forbidden
- ❌ Negative: no auth token → 401 Unauthorized
- ❌ Negative: expired token → 401 Unauthorized
- ❌ Negative: deleted user (token valid) → 401 or 403
- ✅ Edge: system admin bypasses permission checks
- ❌ Edge: tenant user accessing other tenant's data → filter or deny

### 2. Multi-Tenant Isolation Testing

**Scope:** Ensure tenant A cannot access/modify tenant B's distributions

**Test Scenarios:**

**Unit Level (Handler):**
```typescript
// Mock user context with tenantId A
// Attempt to load distribution belonging to tenantId B
// Expected: AggregateNotFoundError or filtered out
```

**Integration Level (Repository):**
```typescript
// Insert distribution for tenant A and tenant B
// Query as tenant A user → only tenant A distributions returned
// Attempt to update tenant B distribution as tenant A → OptimisticLockError or not found
```

**E2E Level (HTTP):**
```typescript
// POST /distributions with JWT for tenant A
// GET /distributions/:id (tenant B's distribution) with tenant A JWT
// Expected: 404 Not Found or 403 Forbidden
```

### 3. Concurrent Access Testing

**Scope:** Verify optimistic locking + ACL under concurrent writes

**Test Pattern:**
```typescript
it('concurrent updates from different tenants isolated', async () => {
  // User A and User B (different tenants) load same distribution (shouldn't happen, but test boundary)
  // User A saves → succeeds
  // User B saves → OptimisticLockError (version mismatch)
  // Verify: User B's tenant sees no side effects from User A's update
});
```

### 4. Permission Boundary Testing

**Scope:** Test edge cases around permission resolution

**Cases:**
- User with `distribution:read` attempts write operation → deny
- User with `distribution:*` wildcard → allow all distribution operations
- User with multiple permissions `['release:write', 'distribution:write']` → ANY-of allows
- User with NO permissions array (system admin) → allow
- User with empty permissions array `[]` → deny

### 5. Security Penetration Scenarios

**Scope:** Adversarial testing for ACL bypass attempts

**Attack Vectors:**

**Token Manipulation:**
```typescript
it('rejects tampered JWT payload', async () => {
  // Modify tenantId in JWT payload without re-signing
  // Expected: JWT verification failure → 401
});

it('rejects JWT with forged signature', async () => {
  // Create JWT signed with wrong key
  // Expected: signature verification failure → 401
});
```

**Injection Attacks:**
```typescript
it('sanitizes tenantId in query params', async () => {
  // Attempt SQL injection via tenantId filter
  // GET /distributions?tenantId='; DROP TABLE distributions; --
  // Expected: validation error or safe handling
});
```

**Privilege Escalation:**
```typescript
it('prevents privilege escalation via API', async () => {
  // Tenant member attempts to grant self system_admin role
  // Expected: 403 Forbidden (only system admin can modify roles)
});
```

**Session Fixation:**
```typescript
it('invalidates old tokens after password change', async () => {
  // Issue JWT → user changes password → old JWT should be revoked
  // Expected: 401 Unauthorized
});
```

### 6. Performance/Load Testing with ACL

**Scope:** Ensure ACL checks don't degrade performance under load

**Metrics:**
- Permission check latency: <5ms per request
- Multi-tenant query filtering overhead: <10ms
- Concurrent authorization checks: 100 req/s without degradation

**Test Pattern:**
```typescript
it('handles 100 concurrent authorized requests', async () => {
  const requests = Array(100).fill(null).map(() =>
    request(app.getHttpServer())
      .post('/distributions')
      .set('Authorization', `Bearer ${validToken}`)
      .send(payload)
  );
  const results = await Promise.all(requests);
  expect(results.every(r => r.status === 201)).toBe(true);
});
```

---

## Test Data Strategy

### User/Role Fixtures

**System Admin:**
```typescript
const systemAdmin = {
  id: 'admin-001',
  type: 'system_admin',
  tenantId: null,
  permission: []  // bypasses checks
};
```

**Tenant Owner:**
```typescript
const tenantOwner = {
  id: 'owner-001',
  type: 'tenant_user',
  tenantId: 'tenant-a',
  tenantUserType: 'owner',
  permission: ['distribution:*', 'release:*']
};
```

**Tenant Member (Writer):**
```typescript
const tenantMember = {
  id: 'member-001',
  type: 'tenant_user',
  tenantId: 'tenant-a',
  tenantUserType: 'member',
  permission: ['distribution:write', 'distribution:read']
};
```

**Tenant Member (Reader):**
```typescript
const tenantReader = {
  id: 'reader-001',
  type: 'tenant_user',
  tenantId: 'tenant-a',
  tenantUserType: 'member',
  permission: ['distribution:read']
};
```

**No Permissions:**
```typescript
const noPermUser = {
  id: 'user-001',
  type: 'tenant_user',
  tenantId: 'tenant-a',
  tenantUserType: 'member',
  permission: []
};
```

### Permission Matrix Test Cases

**Distribution Operations:**
- `distribution:read` → GET /distributions, GET /distributions/:id
- `distribution:write` → POST /distributions, PATCH /distributions/:id
- `distribution:delete` → DELETE /distributions/:id (if applicable)
- `distribution:*` → all distribution operations

**Helper Factory:**
```typescript
function mockUserContext(overrides: Partial<UserContext>): UserContext {
  return {
    id: 'user-' + Date.now(),
    type: 'tenant_user',
    tenantId: 'tenant-default',
    tenantUserType: 'member',
    permission: [],
    ...overrides
  };
}
```

### Multi-Workspace Test Scenarios

**Tenant Isolation:**
```typescript
const tenantA = { id: 'tenant-a', name: 'Tenant A' };
const tenantB = { id: 'tenant-b', name: 'Tenant B' };

const distributionA = createDistribution({ tenantId: tenantA.id });
const distributionB = createDistribution({ tenantId: tenantB.id });

// User from tenant A attempts to access distributionB
const userA = mockUserContext({ tenantId: tenantA.id, permission: ['distribution:*'] });
// Expected: filtered out or 404
```

### Edge Case Test Data

**Expired Token:**
```typescript
const expiredToken = jwt.sign(
  { userId: 'user-001', tenantId: 'tenant-a' },
  JWT_SECRET,
  { expiresIn: '-1h' }  // already expired
);
```

**Deleted User:**
```typescript
// Valid JWT but user deleted from database
const deletedUserToken = createValidJWT({ userId: 'deleted-user-001' });
// Expected: JwtStrategy validate() returns null → 401
```

**Missing tenantId:**
```typescript
const noTenantUser = {
  id: 'user-001',
  type: 'tenant_user',
  tenantId: null,  // invalid for tenant_user
  permission: ['distribution:write']
};
// Expected: PolicyGuard throws TENANT_ID_REQUIRED
```

---

## Testing Tools & Frameworks

### Unit Test Layer

**Framework:** Jest + in-memory test doubles

**Pattern:**
```typescript
describe('OrchestrateHandler with ACL', () => {
  let handler: OrchestrateHandler;
  let repo: InMemoryDistributionRepository;
  let aclService: MockAclService;

  beforeEach(() => {
    repo = new InMemoryDistributionRepository();
    aclService = new MockAclService();
    handler = new OrchestrateHandler(repo, aclService);
  });

  it('denies access when user lacks permission', async () => {
    const user = mockUserContext({ permission: ['distribution:read'] });
    await expect(
      handler.handle({ type: 'SUBMIT', user, ... })
    ).rejects.toThrow('Insufficient permissions');
  });

  it('allows system admin regardless of permissions', async () => {
    const admin = mockUserContext({ type: 'system_admin', permission: [] });
    await handler.handle({ type: 'SUBMIT', user: admin, ... });
    expect(repo.savedEvents).toHaveLength(1);
  });
});
```

### Integration Test Layer

**Framework:** Jest + @testcontainers/postgresql + TypeORM

**Pattern:**
```typescript
describe('DistributionRepository ACL integration', () => {
  let dataSource: DataSource;
  let repo: TypeOrmDistributionRepository;

  beforeAll(async () => {
    const container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({ /* config */ });
    await dataSource.initialize();
    repo = new TypeOrmDistributionRepository(dataSource);
  });

  it('filters distributions by tenantId', async () => {
    await repo.save(createDistribution({ tenantId: 'tenant-a' }));
    await repo.save(createDistribution({ tenantId: 'tenant-b' }));
    
    const results = await repo.findByTenant('tenant-a');
    expect(results).toHaveLength(1);
    expect(results[0].tenantId).toBe('tenant-a');
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });
});
```

### E2E Test Layer

**Framework:** Jest + @nestjs/testing + supertest

**Pattern:**
```typescript
describe('Distribution API ACL (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = app.get(JwtService);
  });

  it('POST /distributions requires distribution:write permission', async () => {
    const token = jwtService.sign({ userId: 'user-001', permission: ['distribution:read'] });
    
    const response = await request(app.getHttpServer())
      .post('/distributions')
      .set('Authorization', `Bearer ${token}`)
      .send(createDistributionDto);
    
    expect(response.status).toBe(403);
    expect(response.body.message).toContain('Insufficient permissions');
  });

  it('filters GET /distributions by tenantId from JWT', async () => {
    const token = jwtService.sign({ 
      userId: 'user-001', 
      tenantId: 'tenant-a',
      permission: ['distribution:read'] 
    });
    
    const response = await request(app.getHttpServer())
      .get('/distributions')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body.data.every(d => d.tenantId === 'tenant-a')).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### Security Testing Tools

**JWT Manipulation:**
```typescript
import * as jwt from 'jsonwebtoken';

it('rejects tampered JWT', async () => {
  const validToken = jwtService.sign({ userId: 'user-001', tenantId: 'tenant-a' });
  const decoded = jwt.decode(validToken, { complete: true });
  
  // Tamper payload
  const tamperedPayload = { ...decoded.payload, tenantId: 'tenant-b' };
  const tamperedToken = jwt.sign(tamperedPayload, 'wrong-secret');
  
  const response = await request(app.getHttpServer())
    .get('/distributions')
    .set('Authorization', `Bearer ${tamperedToken}`);
  
  expect(response.status).toBe(401);
});
```

**Load Testing (Optional):**
```typescript
import { performance } from 'perf_hooks';

it('ACL checks complete within 5ms', async () => {
  const token = createValidToken();
  const start = performance.now();
  
  await request(app.getHttpServer())
    .get('/distributions')
    .set('Authorization', `Bearer ${token}`);
  
  const duration = performance.now() - start;
  expect(duration).toBeLessThan(5);
});
```

---

## Example Test Scenarios

### Scenario 1: Positive Authorization

```typescript
it('allows tenant owner to submit distribution', async () => {
  const user = mockUserContext({
    type: 'tenant_user',
    tenantId: 'tenant-a',
    tenantUserType: 'owner',
    permission: ['distribution:write']
  });

  const command = {
    type: 'SUBMIT',
    distributionId: 'dist-001',
    user,
    create: {
      releaseId: 'release-001',
      tenantId: 'tenant-a',
      channelSpecs: [/* ... */]
    }
  };

  await handler.handle(command);
  
  const distribution = await repo.load('dist-001');
  expect(distribution.state).toBe(DistributionState.VALIDATING);
  expect(distribution.tenantId).toBe('tenant-a');
});
```

### Scenario 2: Negative Authorization (Permission Denied)

```typescript
it('denies tenant member without distribution:write', async () => {
  const user = mockUserContext({
    tenantId: 'tenant-a',
    permission: ['distribution:read']  // lacks :write
  });

  const command = {
    type: 'SUBMIT',
    distributionId: 'dist-001',
    user,
    create: { /* ... */ }
  };

  await expect(handler.handle(command))
    .rejects
    .toThrow('Insufficient permissions: distribution:write');
});
```

### Scenario 3: Multi-Tenant Isolation

```typescript
it('prevents tenant A from accessing tenant B distribution', async () => {
  // Setup: create distribution for tenant B
  const adminUser = mockUserContext({ type: 'system_admin' });
  await handler.handle({
    type: 'SUBMIT',
    distributionId: 'dist-b',
    user: adminUser,
    create: { tenantId: 'tenant-b', /* ... */ }
  });

  // Attempt: tenant A user tries to load
  const tenantAUser = mockUserContext({
    tenantId: 'tenant-a',
    permission: ['distribution:read']
  });

  await expect(
    repo.load('dist-b', { tenantId: tenantAUser.tenantId })
  ).rejects.toThrow('AggregateNotFoundError');
});
```

### Scenario 4: Expired Token

```typescript
it('rejects expired JWT token', async () => {
  const expiredToken = jwt.sign(
    { userId: 'user-001', tenantId: 'tenant-a' },
    JWT_SECRET,
    { expiresIn: '-1h' }
  );

  const response = await request(app.getHttpServer())
    .get('/distributions')
    .set('Authorization', `Bearer ${expiredToken}`);

  expect(response.status).toBe(401);
  expect(response.body.message).toContain('jwt expired');
});
```

### Scenario 5: Concurrent Access

```typescript
it('handles concurrent updates with optimistic locking', async () => {
  const distribution = createDistribution({ tenantId: 'tenant-a' });
  await repo.save(distribution);

  // Two users load same distribution
  const userA = mockUserContext({ tenantId: 'tenant-a', permission: ['distribution:*'] });
  const userB = mockUserContext({ tenantId: 'tenant-a', permission: ['distribution:*'] });

  const [distA, distB] = await Promise.all([
    repo.load('dist-001'),
    repo.load('dist-001')
  ]);

  // User A saves first
  distA.markValidated();
  await repo.save(distA);

  // User B attempts save with stale version
  distB.markValidated();
  await expect(repo.save(distB)).rejects.toThrow(OptimisticLockError);
});
```

---

## CI/CD Integration Approach

### Current CI/CD

**GitHub Actions workflows:**
- `deploy.dev.yml` → deploys to dev on push to `dev` branch
- `deploy.prod.yml` → deploys to prod on push to `main` branch
- `notify.yml` → sends notifications on workflow completion

**Missing:** No automated test runs in CI/CD

### Recommended CI/CD Test Integration

**Add `.github/workflows/test.yml`:**
```yaml
name: Test Suite

on:
  push:
    branches: [main, dev, 'dev-*']
  pull_request:
    branches: [main, dev]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run unit tests
        run: npm run test -- --testPathPattern='spec.ts$' --coverage
      
      - name: Run integration tests
        run: npm run test -- --testPathPattern='integration.spec.ts$'
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      
      - name: Run E2E tests
        run: npm run test -- --testPathPattern='e2e.spec.ts$'
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          JWT_SECRET: test-secret
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()

  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run security audit
        run: npm audit --audit-level=moderate
```

### Test Coverage Goals

**Target Coverage:**
- **Unit tests:** ≥80% line coverage for domain + application layers
- **Integration tests:** 100% coverage of repository + persistence logic
- **E2E tests:** Coverage of happy paths + critical failure scenarios

**Coverage Reporting:**
```json
// jest.config.js
{
  "collectCoverageFrom": [
    "src/modules/distribution-orchestration/**/*.ts",
    "!**/*.spec.ts",
    "!**/*.integration.spec.ts",
    "!**/*.e2e.spec.ts",
    "!**/test-doubles/**"
  ],
  "coverageThresholds": {
    "global": {
      "branches": 75,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

---

## Unresolved Questions

1. **Token Revocation Strategy:** How are JWTs revoked when user permissions change or user is deleted? (Redis blacklist? Short TTL + refresh token?)

2. **Permission Inheritance:** Should `distribution:*` wildcard grant all sub-permissions (`distribution:read`, `distribution:write`, etc.)? Current PolicyGuard uses exact string match.

3. **Audit Logging:** Should all ACL denials be logged for security monitoring? Where (database, external service, file)?

4. **Rate Limiting:** Should ACL include rate limiting per tenant/user to prevent abuse? Not in current scope but consider for Phase 5.

5. **Cross-Tenant Admin:** Can system admins view/modify distributions across all tenants? Current code suggests yes (bypasses tenantId check), confirm this is intended.

6. **API Key Scope:** `INTERNAL_API_KEY` grants `internal:*` — should this be scoped per-service or one key for all internal services?

7. **Test Data Seeding:** Should integration tests seed user/tenant/permission fixtures in database, or mock at guard level?

8. **Performance Baseline:** What is acceptable latency for permission checks? Current assumption: <5ms, confirm with requirements.

9. **Testcontainers Timeout:** Current integration tests use 90s timeout for first-run container pull. Should CI cache Docker images to reduce test time?

10. **Multi-Tenant Query Filtering:** Should repository layer enforce tenantId filtering, or rely on service layer? Current pattern unclear — needs architectural decision.
