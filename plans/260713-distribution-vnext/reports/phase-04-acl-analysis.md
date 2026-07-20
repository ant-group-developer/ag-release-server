# Phase 4 ACL Adapter Analysis — Distribution v-next

**Generated:** 2026-07-20  
**Scope:** Real adapter implementation for 9 domain ports with ACL pattern  
**Context:** Phase 1-3 complete (domain + BullMQ engine + timeline SSE)

---

## Executive Summary

Phase 4 implements real adapters wrapping external systems (SFTP, CI REST, gRPC, email) behind the 9 port interfaces defined in Phase 1. All ports already have in-memory test doubles. SFTP and gRPC adapters reuse existing v3 integration code. **CI adapters use NEW dedicated services** created in `infrastructure/ci-api/` (separate from v3 partners-api).

**Key findings:**
- 9 ports → 7-8 adapter classes (Exporter handles 2 methods internally)
- Strong v3 code reuse: SFTP (ssh2-sftp-client), gRPC (UPC/ISRC services). **CI adapters use NEW dedicated services** in `infrastructure/ci-api/` (not v3 partners-api)
- Idempotency layer 2 (adapter-level) via external system checks, NOT local cache
- Test double vs real adapter controlled by DI tokens at module wire

---

## Port → Adapter Mapping

| # | Port Interface | Adapter Class | External System | V3 Code Reuse |
|---|---------------|---------------|-----------------|---------------|
| 1 | `IdentifierProvisioner` | `GrpcIdentifierAdapter` | gRPC UPC/ISRC server | `src/modules/external/upc/upc.service.ts`<br>`src/modules/external/isrc/isrc.service.ts` |
| 2 | `PackageBuilder` | `DdexXmlPackageBuilder` | xmlbuilder2 + GCS/S3 | `src/modules/release/services/release-ddex.service.ts` (partial DDEX logic)<br>Need new: xmlbuilder2 wrapper + folder structure |
| 3 | `PackageUploader` | `SftpUploaderAdapter` | ssh2-sftp-client | `src/modules/distribution/sftp-connect/sftp-connect.service.ts` (full reuse) |
| 4 | `IngestResultReader` | `CiImportAdapter` | CI REST `/imports/v1/.../batch` | **New:** `infrastructure/ci-api/ci-import-api.service.ts` (dedicated, NOT v3 reuse) |
| 5 | `QaChecker` | `CiQaAdapter` | CI REST `/releases/v2/.../qaflags` | **New:** `infrastructure/ci-api/ci-qa-api.service.ts` (dedicated, NOT v3 reuse) |
| 6 | `Exporter` | `CiExportAdapter`<br>`State51EmailAdapter` | CI export panel<br>SMTP batch email | New: export panel integration<br>New: email batch service |
| 7 | `DeliveryStatusReader` | `CiDeliverDesireAdapter` | CI REST `/exports/v1/.../deliver_desire` | **New:** `infrastructure/ci-api/ci-deliver-desire-api.service.ts` (dedicated, NOT v3 reuse) |
| 8 | `TicketService` | `PostgresTicketAdapter` | Postgres (own schema) | New: simple CRUD, not reusing v3 `issue`/`release_errors` |
| 9 | `Clock` | `SystemClock` | Node.js `Date.now()` | Trivial wrapper |

**Total:** 9 ports → ~8 adapter files (Exporter branches internally by `ExportMethod` enum)

---

## Adapter Implementation Strategy

### 1. GrpcIdentifierAdapter (UPC/ISRC)

**Port contract:**
```typescript
provisionUpc(releaseId, key) → Upc
provisionIsrcs(trackIds[], key) → Map<trackId, Isrc>
```

**V3 reuse:** Direct wrap `UpcService.create()` + `IsrcService.create()`

**ACL translation:**
- Domain `Upc` VO ↔ gRPC `{ upc: string }`
- Domain `Isrc` VO ↔ gRPC `{ isrc: string }`
- Domain `releaseId` → gRPC metadata `releaseId` (custom field TBD)

**Idempotency approach (Layer 2 — adapter-level):**
- gRPC server is idempotent source of truth
- Adapter calls `getUpc(releaseId)` FIRST → if exists, return existing
- Only call `createUpc(releaseId)` if not found
- Same for ISRC: batch `getIsrc(trackIds[])` → provision missing only
- NO local cache in adapter — query external system every time (slow but correct)

**Implementation concerns:**
- Timeout: 10s per gRPC call (already in v3 via `pipe(timeout(10_000))`)
- Retry: 3 attempts with exponential backoff (wrap grpcService call)
- Error mapping: gRPC status codes → domain exceptions (`ProvisioningFailedError`)

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/grpc-identifier.adapter.ts`

---

### 2. DdexXmlPackageBuilder (DDEX XML + GCS/S3)

**Port contract:**
```typescript
build(snapshotId, processCode, key) → PackagePath
```

**V3 reuse:** Partial — `release-ddex.service.ts` has DDEX helpers but needs reorganization

**New implementation:**
- Load `release_snapshot` by snapshotId (jsonb payload)
- Map snapshot → DDEX ERN XML via xmlbuilder2
- Generate folder name: `YYYYMMDDHHmmssSSS` (timestamp-based, deterministic from snapshot)
- Upload XML + audio files to GCS/S3: `gs://bucket/packages/{folder}/`
- Return `PackagePath.create('gs://...')`

**ACL translation:**
- Domain `ReleaseSnapshot` (jsonb) → DDEX ERN XML spec
- Domain `processCode` → DDEX message type (NewReleaseMessage, UpdateMessage, Purge)

**Idempotency approach:**
- Folder name = `${snapshotId}_${processCode}_${timestamp}` (deterministic hash?)
- Check if folder exists in GCS/S3 FIRST → if yes, return existing PackagePath
- If not, build + upload atomically
- Alternatively: store `package_build_cache(snapshotId+processCode → path)` in Postgres (faster check)

**Implementation concerns:**
- Timeout: 2 minutes (large audio files)
- Retry: 3 attempts (network upload can fail)
- Rollback: if upload fails, delete partial folder (compensating action)
- Performance: xmlbuilder2 streaming for large XMLs

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/ddex-xml-package-builder.adapter.ts`

---

### 3. SftpUploaderAdapter (SFTP)

**Port contract:**
```typescript
upload(path: PackagePath, dspCode: DspCode, key) → UploadResult
markBatchDone(path, key) → void  // VIA_AGGREGATOR only: creates .done file
```

**V3 reuse:** Full — `sftp-connect.service.ts` already has:
- `ssh2-sftp-client` wrapper
- Timeout + keepalive (5min inactivity timeout)
- Progress tracking (`step` callback)
- Upload file-by-file with retry

**ACL translation:**
- Domain `DspCode` → SFTP host config lookup (`dspCode → SftpMetadata`)
- Domain `PackagePath` (GCS/S3 URI) → download locally → upload to SFTP remote path
- `UploadResult.bytesSent` from SFTP progress callback

**Idempotency approach:**
- SFTP checksum: compute local file hash → check remote file hash → skip if match
- V3 already has partial logic (check file exists + size)
- Enhance: add SHA256 checksum file `.{filename}.sha256` on remote → compare before upload
- For `markBatchDone`: check if `.done` file exists → if yes, skip creation

**Implementation concerns:**
- **Bulkhead per host:** separate SFTP connection pool per DSP (avoid 1 slow DSP blocking others)
- Timeout: 5min inactivity (already in v3)
- Retry: 3 attempts (spec requirement), exponential backoff
- Circuit breaker: if DSP SFTP fails 5 times consecutively → open circuit, fail-fast for 5min
- Connection pooling: max 2 concurrent uploads per DSP host (SFTP servers rate-limit)

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/sftp-uploader.adapter.ts`

---

### 4. CiImportAdapter (IngestResultReader)

**Port contract:**
```typescript
read(batchId, key) → IngestStatus { kind: 'ok' | 'pending' | 'problem', errors? }
```

**V3 reuse:** `ci-import.service.ts` → `getImports()` already queries `/imports/v1/.../batch`

**ACL translation:**
- Domain `batchId` → CI `batch_id` query param
- CI response `{ status, errors[] }` → domain `IngestStatus` discriminated union

**Idempotency approach:**
- Read-only operation → naturally idempotent (query external system every time)
- No local cache needed

**Implementation concerns:**
- Timeout: 30s (CI API can be slow)
- Retry: 3 attempts with exponential backoff
- Polling strategy: runner calls this every 5min (via delayed job) until status != 'pending'
- Error mapping: CI 404 → 'pending', CI 200 + errors[] → 'problem'

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/ci-import.adapter.ts`

---

### 5. CiQaAdapter (QaChecker)

**Port contract:**
```typescript
check(releaseId, key) → QaResult { kind: 'clean' | 'flagged', flags? }
```

**V3 reuse:** `ci-release.service.ts` → need new method calling `/releases/v2/.../qaflags`

**ACL translation:**
- Domain `releaseId` → CI `release_format_id` (lookup mapping TBD)
- CI response `{ qaflags: [{flag, status}] }` → domain `QaResult`

**Idempotency approach:**
- Read-only → naturally idempotent
- No cache

**Implementation concerns:**
- Timeout: 30s
- Retry: 3 attempts
- Error mapping: CI 404 → assume 'clean' (release not yet in CI)

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/ci-qa.adapter.ts`

---

### 6. CiExportAdapter + State51EmailAdapter (Exporter)

**Port contract:**
```typescript
export(method: ExportMethod, upcs[], recipients?, key) → ExportJobRef
```

**Design decision:** Single `Exporter` port, adapter branches by `method`:
- `method === 'CI_DEAL'` → `CiExportAdapter` (internal delegation)
- `method === 'STATE51'` → `State51EmailAdapter` (internal delegation)

**V3 reuse:** None — both are new integrations

**ACL translation:**
- Domain `ExportMethod` enum → CI admin panel API vs SMTP
- Domain `upcs[]` → CI export payload / email body

**Idempotency approach:**
- CI_DEAL: check if export job already exists for upcs[] (query CI `/exports/v1/.../jobs` by UPCs) → return existing `jobId`
- STATE51: store sent emails in Postgres `email_export_log(upcs_hash, sent_at)` → check before sending

**Implementation concerns (CI_DEAL):**
- New API endpoint discovery: CI export panel automation (TBD — may require manual step workaround)
- Timeout: 60s
- Retry: 3 attempts

**Implementation concerns (STATE51):**
- Email batching: aggregate multiple releases → send 1 email per batch (cron job)
- SMTP config: use existing email service or nodemailer
- Template: plain text list of UPCs + metadata
- Retry: 3 attempts, exponential backoff

**File location:**
- `src/modules/distribution-orchestration/infrastructure/adapters/exporter.adapter.ts` (facade)
- Internal: `ci-export.impl.ts`, `state51-email.impl.ts`

---

### 7. CiDeliverDesireAdapter (DeliveryStatusReader)

**Port contract:**
```typescript
read(batchId, dspCodes[]) → Map<dspCode, DspLiveStatus>
```

**V3 reuse:** `ci-export.service.ts` → `getDeliverDesire()` already queries `/exports/v1/.../deliver_desire`

**ACL translation:**
- Domain `DspCode[]` → CI DSP codes (direct mapping)
- CI response `{ deliver_desire: [{dsp, status}] }` → domain `Map<dspCode, DspLiveStatus>`

**Idempotency approach:**
- Read-only → naturally idempotent

**Implementation concerns:**
- Timeout: 30s
- Retry: 3 attempts
- Polling: background cron job runs every 6 hours to reconcile DSP statuses

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/ci-deliver-desire.adapter.ts`

---

### 8. PostgresTicketAdapter (TicketService)

**Port contract:**
```typescript
open(distributionId, channelId?, reason, detail, key) → TicketRef
resolve(ticket: TicketRef) → void
```

**V3 reuse:** None — NOT reusing v3 `issue` or `release_errors` tables (orthogonal concerns)

**New implementation:**
- New table: `orchestration_ticket(id, distribution_id, channel_id, reason, detail, status, created_at, resolved_at)`
- `open()`: INSERT ticket → return `TicketRef.create(id)`
- `resolve()`: UPDATE status = 'resolved', resolved_at = now()

**ACL translation:**
- Domain `TicketReason` enum → DB enum column
- Domain `TicketRef` VO ↔ DB `id` (string)

**Idempotency approach:**
- Check if ticket exists for `(distributionId, channelId, reason, status='open')` → return existing
- Only INSERT if not found
- `IdempotencyKey` stored in ticket row → dedupe by key

**Implementation concerns:**
- Schema: add table in Phase 4 migration
- Query performance: index on `(distribution_id, status)`, `(channel_id, status)`

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/postgres-ticket.adapter.ts`

---

### 9. SystemClock (Clock)

**Port contract:**
```typescript
now() → Date
```

**Implementation:** Trivial wrapper around `new Date()`

**File location:** `src/modules/distribution-orchestration/infrastructure/adapters/system-clock.adapter.ts` (5 lines)

---

## Idempotency Strategy (Layer 2)

**Key principle:** Idempotency lives in ADAPTER, not domain. Domain assumes adapter honors contract.

**Two idempotency layers:**
1. **Layer 1 (BullMQ):** Job-level dedupe by `jobId` (already implemented in Phase 2)
2. **Layer 2 (Adapter):** Side-effect-level dedupe (Phase 4 focus)

**Layer 2 implementation per adapter:**

| Adapter | Idempotency Mechanism | Check Location |
|---------|----------------------|----------------|
| GrpcIdentifierAdapter | Query gRPC first → only create if not exists | External gRPC server |
| DdexXmlPackageBuilder | Check GCS/S3 folder exists OR Postgres cache | GCS/S3 + optional DB cache |
| SftpUploaderAdapter | Checksum comparison (SHA256) | SFTP remote file + `.sha256` |
| CiImportAdapter | Read-only → naturally idempotent | N/A |
| CiQaAdapter | Read-only → naturally idempotent | N/A |
| CiExportAdapter | Query existing export jobs OR Postgres log | CI API + DB log |
| State51EmailAdapter | Postgres `email_export_log` table | DB |
| CiDeliverDesireAdapter | Read-only → naturally idempotent | N/A |
| PostgresTicketAdapter | Query existing open ticket by key | DB |

**Why NOT local in-memory cache?**
- Worker processes can restart → cache lost
- Multiple worker instances → cache inconsistent
- External system is source of truth → query it directly (slower but correct)

**Exception:** `PackageBuilder` may use Postgres cache for performance (GCS/S3 list is slow)

---

## Test Double vs Real Adapter Wiring

**DI token strategy:** Module wire determines which implementation to use

**Example (identifier provisioner):**

```typescript
// domain/ports/identifier-provisioner.port.ts
export const IDENTIFIER_PROVISIONER = Symbol('IdentifierProvisioner');

// distribution-orchestration.module.ts
@Module({
  providers: [
    {
      provide: IDENTIFIER_PROVISIONER,
      useClass: process.env.NODE_ENV === 'test'
        ? InMemoryIdentifierProvisioner  // test double
        : GrpcIdentifierAdapter,         // real adapter
    },
    // ... 8 other ports
  ],
})
```

**Test strategy:**
- **Unit tests:** Use in-memory test doubles (fast, no external deps)
- **Integration tests:** Use real adapters against staging external systems
- **E2E tests:** Use real adapters + testcontainers for DB

**Phase 4 scope:** Implement real adapters + keep test doubles for unit tests

---

## Implementation Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **SFTP timeout/network flakiness** | Upload fails → release stuck | 3 retries + circuit breaker per host + bulkhead isolation |
| **CI API rate limiting** | Polling overloads CI → 429 errors | Exponential backoff + max 1 req/5min per release |
| **gRPC UPC/ISRC service down** | Cannot provision IDs → blocks all releases | Circuit breaker + fallback queue (retry later) |
| **GCS/S3 upload fails mid-package** | Partial package on storage | Atomic upload: temp folder → rename when complete |
| **CI export panel API unknown** | Cannot automate export | Fallback: manual export step (admin UI) + mark done manually |
| **Email delivery failure (STATE51)** | DSPs don't receive notification | Retry 3x + store sent log + admin alert |
| **Idempotency check slow (GCS list)** | Adapter latency → queue buildup | Add Postgres cache: `package_build_cache` table |
| **Adapter layer too thick** | ACL logic leaks into domain | Strict interface adherence + code review |

---

## Migration from Test Doubles (Phase 4 Execution)

**Incremental adapter replacement strategy:**

1. **Start with read-only adapters (lowest risk):** ✅ DONE
   - SystemClock (trivial)
   - CiImportAdapter, CiQaAdapter, CiDeliverDesireAdapter (new dedicated CI API services in `infrastructure/ci-api/`)

2. **Then write-only adapters with rollback:**
   - PostgresTicketAdapter (own DB, easy rollback)
   - DdexXmlPackageBuilder (GCS/S3, can delete folder)

3. **Finally critical adapters with external side-effects:**
   - GrpcIdentifierAdapter (mints UPC/ISRC — idempotency critical)
   - SftpUploaderAdapter (uploads to DSP — most complex)
   - Exporter adapters (external notifications)

4. **Testing flow per adapter:**
   - Unit test: adapter in isolation with mocked external client
   - Integration test: adapter against staging external system
   - E2E test: full release flow with real adapter + assert side-effects

5. **Rollback plan:**
   - Keep test doubles as fallback
   - Feature flag per adapter: `USE_REAL_SFTP_ADAPTER=true`
   - Monitor error rates → rollback to test double if >5% failure

---

## Open Questions

1. **CI export panel API:** Does CI provide automation API for export step? Or manual-only?
   - **Action:** Research CI docs + ask CI support
   - **Fallback:** Manual export + mark done via admin UI

2. **UPC/ISRC gRPC idempotency:** Does gRPC server enforce idempotency or does adapter need to?
   - **Action:** Test gRPC `createUpc` twice with same releaseId → observe behavior
   - **Expected:** Server returns existing UPC (idempotent)

3. **SFTP checksum support:** Do all DSP SFTP servers support checksum files?
   - **Action:** Test upload `.sha256` file to Spotify, Vevo SFTP
   - **Fallback:** Use file size + timestamp comparison (weaker but universal)

4. **Package folder naming:** Deterministic hash vs timestamp?
   - **Option A:** `${sha256(snapshotId+processCode).substring(0,16)}` (deterministic, idempotent check fast)
   - **Option B:** `${timestamp}_${snapshotId}` (readable, idempotent check requires GCS list)
   - **Recommendation:** Option A for idempotency, store mapping in Postgres cache

5. **Adapter timeout tuning:** What are realistic timeouts for each external system?
   - **Action:** Measure P95 latency in staging → set timeout = P95 * 3
   - **Initial values:** gRPC 10s, CI API 30s, SFTP 5min, GCS upload 2min

6. **Test double removal timeline:** When to deprecate in-memory test doubles?
   - **Answer:** NEVER — keep for fast unit tests. Real adapters for integration/E2E only.

---

## Success Criteria (Phase 4 Exit)

- [ ] All 9 ports have real adapter implementations
- [ ] Adapters pass integration tests against staging external systems
- [ ] Idempotency verified: run same job 3x → only 1 side-effect
- [ ] Timeout + retry + circuit breaker tested per adapter
- [ ] E2E test: 1 INITIAL_RELEASE flows through real adapters → release goes live
- [ ] Test doubles still work for unit tests (DI token switch validated)
- [ ] No domain layer changes (ports unchanged)
- [ ] Adapter files < 200 LOC each (SftpUploaderAdapter may need split)
- [ ] Module wire documented: when to use test double vs real adapter

---

## Next Steps (Phase 4 Implementation Order)

**Week 1: Read-only adapters (low risk)**
1. SystemClock (30min)
2. CiImportAdapter (2h)
3. CiQaAdapter (2h)
4. CiDeliverDesireAdapter (2h)

**Week 2: Persistence adapters**
5. PostgresTicketAdapter (4h + migration)
6. DdexXmlPackageBuilder (8h — most complex logic)

**Week 3: Critical external adapters**
7. GrpcIdentifierAdapter (4h + idempotency testing)
8. SftpUploaderAdapter (8h — bulkhead + circuit breaker)

**Week 4: Export adapters + integration**
9. Exporter (CI + State51) (6h)
10. Integration tests for all adapters (8h)
11. E2E test full release flow (4h)

**Total estimate:** ~50 hours (~2 sprints for 1 dev, or 1 sprint for 2 devs in parallel)

---

## File Structure (Phase 4 Deliverables)

```
src/modules/distribution-orchestration/
├── infrastructure/
│   ├── adapters/
│   │   ├── grpc-identifier.adapter.ts
│   │   ├── ddex-xml-package-builder.adapter.ts
│   │   ├── sftp-uploader.adapter.ts
│   │   ├── ci-import.adapter.ts
│   │   ├── ci-qa.adapter.ts
│   │   ├── ci-deliver-desire.adapter.ts
│   │   ├── exporter.adapter.ts          (facade)
│   │   ├── ci-export.impl.ts
│   │   ├── state51-email.impl.ts
│   │   ├── postgres-ticket.adapter.ts
│   │   └── system-clock.adapter.ts
│   ├── adapters/__tests__/
│   │   ├── grpc-identifier.integration.spec.ts
│   │   ├── sftp-uploader.integration.spec.ts
│   │   └── ... (9 integration test files)
│   └── test-doubles/                     (keep for unit tests)
│       ├── in-memory-identifier-provisioner.ts
│       └── ... (9 test double files — unchanged)
├── domain/ports/                          (unchanged)
└── distribution-orchestration.module.ts   (wire real adapters)
```

**Migration file:** `src/migrations/1784300000000-CreateOrchestrationTicketTable.ts`

---

## References

- **Phase 1 port definitions:** `src/modules/distribution-orchestration/domain/ports/*.port.ts`
- **Phase 2 idempotency guide:** `plans/260713-distribution-vnext/phase-02-bullmq-engine.md` §3 (quyết định #23-28)
- **ACL architecture:** `docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md` §9
- **V3 SFTP:** `src/modules/distribution/sftp-connect/sftp-connect.service.ts`
- **V3 CI API:** `src/modules/partners-api/ci/services/*.service.ts`
- **V3 gRPC:** `src/modules/external/upc/upc.service.ts`, `src/modules/external/isrc/isrc.service.ts`
- **Test doubles:** `src/modules/distribution-orchestration/infrastructure/test-doubles/*.ts`
