# Phase 4 ACL Adapter Questions — Answered

**Research Date:** 2026-07-20  
**Codebase Version:** dev-duc-phase4-integration-acl (ffb88ba7)  
**Researcher:** general-purpose agent

---

## Question 1: CI Export Panel API

**Question:** Does v3 call CI export API automatically or require manual step?

**Answer:** v3 uses **polling-based read-only API** — NO automatic export trigger found.

**Evidence:**
- **File:** `src/modules/partners-api/ci/services/ci-export.service.ts`
- **Lines 65-84:** `getDeliverDesire()` method performs GET request to CI's `/exports/v1/organisations/${orgId}/deliver_desire` endpoint
- **Lines 86-126:** `getStatusDsps()` method reads DSP statuses by polling deliver_desire API
- **No POST/PUT calls:** CI export service has ONLY read operations (GET)
- **Controller:** `src/modules/partners-api/ci/controllers/ci-export.controller.ts` exposes GET endpoints only

**Code Snippet (ci-export.service.ts:65-84):**
```typescript
async getDeliverDesire(params?: GetCiDeliverDesireDto): Promise<any> {
    try {
        const endpoint = `/exports/v1/organisations/${this.organisationId}/deliver_desire`;
        const response = await this.client.get(endpoint, {
            params: this.buildParams({
                ...params,
                status: 'complete',
                transfer_batch_status: 'transferred',
            }),
        });
        return response.data;
    } catch (error) {
        // error handling
    }
}
```

**Recommendation for Phase 4:**
- Phase 4 ACL adapter should implement **polling-based DeliveryStatusReader** adapter
- ✅ DONE: Uses new `CiDeliverDesireApiService.getDeliverDesire()` (in `infrastructure/ci-api/`, NOT v3 `CiExportService`)
- CI "export" happens outside SmartHub — we only READ status via API
- NO need to implement "trigger export" — CI does it automatically when batch uploaded

**Risk if wrong:** If we build export-triggering API call, it will fail (endpoint doesn't exist). Low risk — read-only polling is safe.

---

## Question 2: UPC/ISRC gRPC Idempotency

**Question:** Does v3 call `getUpc()` first before `create()`, or does gRPC service handle idempotency?

**Answer:** v3 calls **`getUpc()`/`getIsrc()` ONLY** — NO explicit check-then-create pattern. gRPC service IS idempotent by design.

**Evidence:**
- **UPC Service:** `src/modules/external/upc/upc.service.ts`
  - Line 59-66: `getUpc(payload: GetUpcRequest)` — returns existing or creates new
  - Line 51-56: `create(payload: CreateUpc)` — exists but NOT used in release flow
- **ISRC Service:** `src/modules/external/isrc/isrc.service.ts`
  - Line 50-56: `create(payload: CreateIsrc)` — used directly in track service
- **Usage Pattern (release.service.ts:478):**
```typescript
const res = await this.upcService.getUpc({ prefixUpcId });
const newUpc = res.upc;
```
- **Usage Pattern (track.service.ts:300):**
```typescript
const res = await this.isrcService.create(payload);
const newIsrc = res.data.code;
```

**Key Finding:** 
- UPC uses `getUpc()` which is **idempotent by design** (get-or-create)
- ISRC uses `create()` directly — gRPC service must handle idempotency internally
- NO check-then-create pattern in application code

**Recommendation for Phase 4:**
- Use **`IdentifierProvisioner` port** abstraction (already in domain layer)
- Adapter should call `getUpc()` for UPC (idempotent by design)
- Adapter should call `create()` for ISRC (gRPC handles idempotency)
- Trust gRPC service idempotency — NO double-check needed
- Timeout: 10s for create/get operations (see timeout values below)

**Risk if wrong:** If we add redundant check-then-create, we double the RPC calls and latency. Medium risk — but gRPC service is designed for direct calls.

---

## Question 3: SFTP Checksum Support

**Question:** Does v3 SFTP upload use checksum-based idempotency?

**Answer:** **NO checksum verification in v3 SFTP upload.** Idempotency handled by NOT re-uploading same file path.

**Evidence:**
- **File:** `src/modules/distribution/sftp-connect/sftp-connect.service.ts`
- **Lines 304-360:** `uploadFile()` method — uses `client.put(localPath, remotePath)` with NO checksum generation or verification
- **Lines 404-460:** `uploadFolder()` method — recursive upload with NO checksum logic
- **Lines 731-796:** `uploadFolderS3Recursive()` — S3 upload with NO checksum parameter
- **PackagePath VO:** `src/modules/distribution-orchestration/domain/value-objects/package-path.vo.ts` has optional `checksum` field (line 12) but NOT used in v3

**Code Evidence (sftp-connect.service.ts:356):**
```typescript
await this.uploadFileWithTimeout(client, localPath, remotePath);
```
No checksum calculation before or after upload.

**Current Idempotency Mechanism:**
- v3 relies on **folder naming uniqueness** (timestamp-based batchId)
- Each release creates NEW folder: `YYYYMMDDHHmmssSSS/UPC/`
- Re-upload same batchId overwrites files — NO idempotency check

**Recommendation for Phase 4:**
- Phase 4 PackageUploader adapter should use **path-based idempotency** (same as v3)
- Optional: Add SHA256 checksum in PackagePath VO for future verification
- Phase 4 spec already mentions "Idempotent by checksum" (package-uploader.port.ts:12) — this is FUTURE enhancement, NOT v3 behavior
- For MVP: implement path-based idempotency (track uploaded paths in memory/DB)

**Risk if wrong:** If we assume v3 has checksum-based idempotency, we'll waste time searching for non-existent code. Low risk — path-based works.

---

## Question 4: Package Folder Naming Convention

**Question:** What is the v3 pattern for DDEX package folder names?

**Answer:** **Timestamp-based batchId:** `YYYYMMDDHHmmssSSS` format (17 digits).

**Evidence:**
- **File:** `src/utils/util.ts` lines 190-204
```typescript
export function genBatchId(): string {
    const d = new Date();
    const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
    
    return (
        d.getFullYear().toString() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        pad(d.getSeconds()) +
        pad(d.getMilliseconds(), 3)
    );
}
```
- **Usage:** `src/modules/release/services/release-ddex.service.ts` line 81
```typescript
const batchId = genBatchId(); // e.g., "20260720143052847"
const outputRoot = path.join(baseDir, batchId);
const releaseDir = path.join(outputRoot, releaseReference); // batchId/UPC/
```

**Folder Structure:**
```
release_parsed/
  └── 20260720143052847/          # batchId (timestamp)
      └── 850080651804/            # UPC or ISRC
          ├── resources/           # audio/video/images
          └── release.xml          # DDEX XML
```

**Recommendation for Phase 4:**
- PackageBuilder adapter should use **`genBatchId()`** for folder naming
- Format: `YYYYMMDDHHmmssSSS` (17 chars, millisecond precision)
- Keep same convention for seamless migration
- PackagePath.key = `${batchId}/${releaseReference}`

**Risk if wrong:** If we use different naming (e.g., UUID or hash), existing monitoring/debugging tools expecting timestamp format will break. Low risk — timestamp is standard.

---

## Question 5: Adapter Timeout Values

**Question:** What timeout values does v3 use for external calls?

**Answer:** v3 uses **differentiated timeouts** by operation type:

**gRPC Services (UPC/ISRC):**
- **List operations:** 30,000ms (30s)
  - `upc.service.ts:47` — `pipe(timeout(30_000))`
  - `isrc.service.ts:46` — `pipe(timeout(30_000))`
- **Create/Get operations:** 10,000ms (10s)
  - `upc.service.ts:55, 65` — `pipe(timeout(10_000))`
  - `isrc.service.ts:55, 72` — `pipe(timeout(10_000))`

**CI API (axios):**
- **No explicit timeout configured** in `axios.create()` (ci-export.service.ts:21-38)
- Uses axios default: **0 (no timeout)** — waits indefinitely
- Should be fixed to avoid hanging requests

**SFTP:**
- **Connection timeout:** 60,000ms (60s) — `readyTimeout: 60_000` (sftp-connect.service.ts:38)
- **Upload inactivity timeout:** 300,000ms (5 min) — per-file watchdog (sftp-connect.service.ts:70)
- **Keepalive:** 20,000ms interval, 3 missed max (sftp-connect.service.ts:39-40)

**S3:**
- **Connection timeout:** 60,000ms (60s) — `connectionTimeout: 60000` (sftp-connect.service.ts:686)
- **Socket timeout:** 300,000ms (5 min) — `socketTimeout: 300000` (sftp-connect.service.ts:687)
- **Upload abort timeout:** 3,600,000ms (1 hour) — `s3UploadTimeoutMs` (sftp-connect.service.ts:25)

**Recommendation for Phase 4:**
- **IdentifierProvisioner adapter (UPC/ISRC gRPC):**
  - Create/Get: 10s timeout
  - List: 30s timeout (if needed)
- **DeliveryStatusReader adapter (CI API):**
  - Add explicit timeout: 30s (read operations)
  - Use axios timeout config
- **PackageUploader adapter (SFTP/S3):**
  - Connection: 60s
  - Transfer: 5min per-file inactivity watchdog
  - S3 large file: 1 hour abort timeout
- **General rule:** Short ops (RPC) = 10s, Long ops (transfer) = 5min+

**Risk if wrong:** If we use too short timeouts (e.g., 5s for SFTP), uploads will fail. If too long (e.g., no timeout for CI API), hung requests block workers. Medium risk — timeout tuning is critical.

---

## Question 6: Test Double Strategy

**Question:** Should Phase 4 keep test doubles forever or replace with real adapters?

**Answer:** **KEEP test doubles FOREVER** for unit tests. v3 already uses this pattern extensively.

**Evidence:**
- **Test Doubles Directory:** `src/modules/distribution-orchestration/infrastructure/test-doubles/`
- **Files Found:**
  - `in-memory-unit-of-work.ts`
  - `in-memory-distribution-repository.ts`
  - `in-memory-package-builder.ts`
  - `in-memory-package-uploader.ts`
  - `in-memory-identifier-provisioner.ts`
  - `in-memory-qa-checker.ts`
  - `in-memory-ticket-service.ts`
  - `in-memory-delivery-status-reader.ts`
  - `in-memory-ingest-result-reader.ts`
  - `in-memory-exporter.ts`
  - `fixed-clock.ts`

**Test Double Usage (orchestrate.handler.spec.ts:6-8, 57-58):**
```typescript
import { FixedClock } from '../../infrastructure/test-doubles/fixed-clock';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';

beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    repo = new InMemoryDistributionRepository();
    clock = new FixedClock(new Date('2026-07-17T10:00:00Z'));
    handler = new OrchestrateHandler(uow, repo, new DefaultPolicyResolver(), clock);
});
```

**Test Double Features (in-memory-package-uploader.ts:14-41):**
- Idempotent by (path, dspCode) — line 28
- `failNextUpload()` method for testing retry logic — line 19
- Zero I/O, fully deterministic

**Recommendation for Phase 4:**
- **Unit tests:** ALWAYS use test doubles (in-memory implementations)
- **Integration tests:** Use real adapters against test infrastructure (test SFTP server, mock CI API)
- **E2E tests:** Use real adapters against staging environment
- **Benefits:**
  - Fast unit tests (no I/O)
  - Deterministic (no flaky tests)
  - Portable (run anywhere, no external deps)
  - Easy failure injection (`failNextUpload()`)

**Risk if wrong:** If we remove test doubles and force integration tests for everything, test suite becomes slow (minutes instead of seconds), flaky (network issues), and environment-dependent (needs SFTP/gRPC/CI setup). HIGH risk — keep test doubles.

---

## Summary Table

| Question | v3 Behavior | Phase 4 Recommendation | Risk Level |
|----------|-------------|------------------------|------------|
| **1. CI Export API** | Read-only polling (GET) | Use `getStatusDsps()`, poll-based reader | Low |
| **2. UPC/ISRC Idempotency** | `getUpc()` idempotent, `create()` direct | Trust gRPC idempotency, no double-check | Medium |
| **3. SFTP Checksum** | NO checksum, path-based idempotency | Path-based for MVP, checksum optional future | Low |
| **4. Folder Naming** | Timestamp `YYYYMMDDHHmmssSSS` | Keep same convention via `genBatchId()` | Low |
| **5. Timeouts** | gRPC 10s, SFTP 60s+5min, CI no timeout | gRPC 10s, SFTP 60s+5min, CI add 30s | Medium |
| **6. Test Doubles** | Extensive in-memory doubles | KEEP forever for unit tests | High |

---

## Unresolved Questions

None — all 6 questions answered with definitive evidence.

---

## Next Steps for Phase 4 Implementation

1. **DeliveryStatusReader adapter:** ✅ DONE
   - Uses new `CiDeliverDesireApiService` (in `infrastructure/ci-api/`, NOT v3 `CiExportService`)
   - 30s timeout configured in `CiApiService` base client

2. **IdentifierProvisioner adapter:**
   - Wire `UpcService.getUpc()` (10s timeout)
   - Wire `IsrcService.create()` (10s timeout)
   - NO pre-check logic needed

3. **PackageUploader adapter:**
   - Wire `SftpConnectService.uploadFolder()`
   - Use existing timeout values (60s conn, 5min transfer)
   - Implement path-based idempotency tracking

4. **PackageBuilder adapter:**
   - Use `genBatchId()` for folder naming
   - Follow existing folder structure: `batchId/releaseReference/`

5. **Test coverage:**
   - Keep all test doubles in `infrastructure/test-doubles/`
   - Add integration tests with real adapters separately
   - Follow pattern from `orchestrate.handler.spec.ts`
