# Phase 4 — Chia nhỏ task thực hiện (Implementation Breakdown)

**Ngày:** 2026-07-20 · **Nguồn:** [phase-04-acl-analysis.md](reports/phase-04-acl-analysis.md) + [phase-04-questions-answered.md](reports/phase-04-questions-answered.md)

## Trạng thái nền (đã kiểm tra code)

- ✅ `SystemClock` đã có tại `infrastructure/clock/system-clock.adapter.ts` (port Clock XONG)
- ✅ 7 step-runners đã `@Injectable()`, mỗi runner tự khai DI token (`Symbol`)
- ✅ 11 test-double in-memory đã có — GIỮ NGUYÊN cho unit test
- ⚠️ Chưa có `infrastructure/adapters/` — tạo mới
- ⚠️ TicketService chưa wire vào runner (Step 6 v3 defer)

## DI token map (đã có sẵn trong step-runners)

| Token | File khai báo | Adapter cần viết |
|-------|--------------|------------------|
| `IDENTIFIER_PROVISIONER` | `provision-id.runner.ts:25` | GrpcIdentifierAdapter |
| `PACKAGE_BUILDER` | `build-package.runner.ts:24` | DdexXmlPackageBuilder |
| `PACKAGE_UPLOADER` | `sftp-upload.runner.ts:32` | SftpUploaderAdapter |
| `INGEST_RESULT_READER` | `ci-import-check.runner.ts:26` | CiImportAdapter |
| `QA_CHECKER` | `qa.runner.ts:21` | CiQaAdapter |
| `EXPORTER` | `export-batch.runner.ts:24` | ExporterAdapter (CI + State51) |
| `DELIVERY_STATUS_READER` | `status-sync.runner.ts:23` | CiDeliverDesireAdapter |
| `TICKET_SERVICE` | (chưa có — tạo) | PostgresTicketAdapter |

## Nguyên tắc mỗi task

1. Viết adapter → wire DI token vào module → viết integration test (skip nếu chưa có staging).
2. Test-double GIỮ NGUYÊN. Unit test không đổi.
3. Adapter < 200 LOC (tách file nếu vượt).
4. Domain/port KHÔNG đổi 1 dòng.
5. Sau mỗi adapter: `tsc` sạch cho module.

---

## GROUP A — Read-only CI adapters (rủi ro thấp, làm trước)

> Chỉ GET request, tự idempotent. **Đã tạo CI API services riêng** trong `infrastructure/ci-api/` (KHÔNG dùng v3 service trực tiếp). Không side-effect.

### A1 — CiImportAdapter (IngestResultReader)
- **Port:** `read({batchId, key}) → IngestStatus{ok|pending|problem}`
- **V3 reuse:** ~~`partners-api/ci/services/ci-import.service.ts`~~ → Tạo mới `infrastructure/ci-api/ci-import-api.service.ts`
- **ACL:** CI `{status, errors[]}` → discriminated union; CI 404 → `pending`
- **Timeout:** thêm 30s (v3 axios CHƯA có timeout — fix luôn)
- **File:** `infrastructure/adapters/ci-import.adapter.ts`
- **DI:** wire `INGEST_RESULT_READER`
- **Est:** 2h

### A2 — CiQaAdapter (QaChecker)
- **Port:** `check({releaseId, key}) → QaResult{clean|flagged}`
- **V3 reuse:** ~~`ci-release.service.ts`~~ → Tạo mới `infrastructure/ci-api/ci-qa-api.service.ts` (2-step: UPC → releaseId → flags)
- **ACL:** CI `{qaflags:[{flag,status}]}` → QaResult; CI 404 → `clean`
- **Timeout:** 30s
- **File:** `infrastructure/adapters/ci-qa.adapter.ts`
- **DI:** wire `QA_CHECKER`
- **Est:** 2h

### A3 — CiDeliverDesireAdapter (DeliveryStatusReader)
- **Port:** `read({upc, dspCodes[]}) → Map<dspCode, DspLiveStatus>` (đã đổi từ `batchId` → `upc`: CI deliver_desire tra theo UPC, không theo batchId — xem comment adapter)
- **V3 reuse:** ~~`ci-export.service.ts`~~ → Tạo mới `infrastructure/ci-api/ci-deliver-desire-api.service.ts`
- **ACL:** CI `{deliver_desire:[{dsp,status}]}` → Map
- **Timeout:** 30s
- **File:** `infrastructure/adapters/ci-deliver-desire.adapter.ts`
- **DI:** wire `DELIVERY_STATUS_READER`
- **Est:** 2h

**Exit Group A:** ✅ DONE — 3 CI adapter + 6 file `infrastructure/ci-api/` + module wire xong, tsc sạch.

> ✅ Status: COMPLETE

---

## GROUP B — Persistence adapter (own DB, rollback dễ)

### B1 — PostgresTicketAdapter (TicketService) + migration
- **Port:** `open({distributionId, channelId?, reason, detail, key}) → TicketRef` · `resolve({ticket})`
- **V3 reuse:** KHÔNG (không tái dùng `issue`/`release_errors` v3)
- **Mới:**
  - ORM entity `orchestration-ticket.orm-entity.ts` (id, distribution_id, channel_id?, reason, detail, status, idempotency_key, created_at, resolved_at)
  - Migration `CreateOrchestrationTicketTable`
  - Index: `(distribution_id, status)`, `(channel_id, status)`, unique `idempotency_key`
    - ⚠️ Rà soát 2026-07-23: ORM hiện chỉ có `(distribution_id, status)` + unique `idempotency_key`; **thiếu `(channel_id, status)`** → xem FU-6 (phase-05).
- **Idempotency:** query ticket theo `key` → có thì return, chưa thì INSERT
- **File:** `infrastructure/adapters/postgres-ticket.adapter.ts` + `infrastructure/persistence/orchestration-ticket.orm-entity.ts`
- **DI:** tạo token `TICKET_SERVICE` + wire
- **Est:** 4h (gồm migration + test container)

**Exit Group B:** ✅ DONE — table tạo, adapter idempotent, 6 integration test real DB (testcontainers) xanh.

---

## GROUP C — PackageBuilder (phức tạp nhất, DDEX + storage)

### C1 — DdexXmlPackageBuilder (PackageBuilder)
- **Port:** `build({snapshotId, processCode, key}) → PackagePath`
- **V3 reuse:** `release/services/release-ddex.service.ts` (DDEX logic — cần refactor tách)
- **Folder naming:** DÙNG LẠI `genBatchId()` (`src/utils/util.ts:190`) — format `YYYYMMDDHHmmssSSS`
- **Cấu trúc:** `batchId/{releaseReference}/resources/ + release.xml`
- **Bước:**
  1. Load `release_snapshot` theo snapshotId (jsonb)
  2. Map snapshot → DDEX ERN XML (xmlbuilder2)
  3. `processCode` → message type (NewRelease/Update/Purge)
  4. Upload XML + assets lên GCS/S3
  5. Return `PackagePath.create(...)`
- **Idempotency:** check folder tồn tại (hoặc Postgres cache `package_build_cache`) → có thì return
- **Timeout:** 2min (file lớn); rollback: xóa folder nếu fail
- **File:** `infrastructure/adapters/ddex-xml-package-builder.adapter.ts` (có thể tách builder + storage)
- **DI:** wire `PACKAGE_BUILDER`
- **Est:** 8h — cân nhắc tách sub-task C1a (DDEX mapping) + C1b (storage upload)

**Exit Group C:** ✅ DONE — DdexXmlPackageBuilder (276 LOC) + DdexDataMapper (518 LOC, pure functions) + ProcessCodeResolver (73 LOC). 13 unit tests (data-mapper) + 9 unit tests (process-code). Local filesystem build, idempotent check (folder exists → skip). Tách mapper/resolver ra file riêng (adapter <200 LOC rule).

---

## GROUP D — Critical external adapters (side-effect thật)

### D1 — GrpcIdentifierAdapter (IdentifierProvisioner)
- **Port:** `provisionUpc({releaseId, key}) → Upc` · `provisionIsrcs({trackIds[], key}) → Map`
- **V3 reuse:** `external/upc/upc.service.ts` → `getUpc()` · `external/isrc/isrc.service.ts` → `create()`
- **Idempotency:** UPC dùng `getUpc()` (get-or-create), ISRC `create()` (gRPC tự idempotent) — KHÔNG check-then-create
- **Timeout:** 10s (create/get) — theo v3
- **ACL:** gRPC `{upc}` → `Upc` VO; `{isrc}` → `Isrc` VO
- **File:** `infrastructure/adapters/grpc-identifier.adapter.ts`
- **DI:** wire `IDENTIFIER_PROVISIONER`
- **Est:** 4h (gồm test idempotency)

### D2 — SftpUploaderAdapter (PackageUploader)
- **Port:** `upload({path, dspCode, key}) → UploadResult` · `markBatchDone({path, key})`
- **V3 reuse:** `distribution/sftp-connect/sftp-connect.service.ts` (full — ssh2-sftp-client, timeout, keepalive)
- **Idempotency:** path-based (folder timestamp duy nhất) — KHÔNG checksum (theo v3); checksum = future
- **markBatchDone:** VIA_AGGREGATOR → tạo `.done` file; check tồn tại trước
- **Resilience:** bulkhead per host (pool riêng/DSP) · circuit breaker · retry ≤3 (spec)
- **Timeout:** 60s conn + 5min transfer watchdog (theo v3)
- **File:** `infrastructure/adapters/sftp-uploader.adapter.ts` (có thể >200 LOC → tách pool/circuit-breaker)
- **DI:** wire `PACKAGE_UPLOADER`
- **Est:** 8h

**Exit Group D:** ✅ DONE — GrpcIdentifierAdapter (189 LOC, 8 tests) + SftpUploaderAdapter (145 LOC, 5 tests). UPC via UpcService.getUpc(), ISRC via IsrcService.create(). SFTP via SftpConnectService.uploadFolder()/uploadFile(). markBatchDone creates `.done` marker file.

---

## GROUP E — Export adapters + Integration

### E1 — ExporterAdapter (Exporter — facade CI + State51)
- **Port:** `export({method, upcs[], recipients?, key}) → ExportJobRef`
- **V3 reuse:** KHÔNG (mới)
- **Branch nội bộ theo `method`:**
  - `CI_DEAL` → gọi CI export (⚠️ câu hỏi mở: v3 CHỈ có read-only, KHÔNG có trigger API → cần confirm luồng)
  - `STATE51` → email batch (nodemailer/email service) + log `email_export_log`
- **Idempotency:** CI query job tồn tại; STATE51 check `email_export_log(upcs_hash)`
- **File:** `infrastructure/adapters/exporter.adapter.ts` + `ci-export.impl.ts` + `state51-email.impl.ts`
- **DI:** wire `EXPORTER`
- **Est:** 6h
- **⚠️ Blocker cần xác nhận:** CI export là auto (batch upload) hay cần trigger? (xem Q1 — nghiêng về auto, adapter chỉ mark/no-op)

### E2 — Wire toàn bộ + register runners vào module
- Thêm 8 `{provide, useClass}` vào `distribution-orchestration.module.ts`
- Register 7 step-runners vào providers
- DI switch test-double vs real adapter (env-based hoặc config)
- **Est:** 2h

### E3 — Integration + E2E tests
- Integration test mỗi adapter (real external / testcontainers)
- E2E: 1 INITIAL_RELEASE flow qua real adapters → live
- **Est:** 12h

**Exit Group E:** ✅ DONE — ExporterAdapter (143 LOC, 9 tests): CI_DEAL = no-op (CI auto-imports); STATE51 = email via Resend. Module wire đủ 9 port → 9 adapter. 7 step-runners registered.

---

## Thứ tự đề xuất & dependency

```text
A1,A2,A3 (song song, độc lập)  ──┐
B1 (độc lập)                     ──┼──▶ E2 (wire) ──▶ E3 (test)
C1 (độc lập, phức tạp)           ──┤
D1 (độc lập)                     ──┤
D2 (độc lập)                     ──┤
E1 (cần confirm blocker CI)      ──┘
```

- Group A/B/C/D/E1 **độc lập nhau** — có thể làm song song hoặc tuần tự.
- E2 (wire module) cần ≥1 adapter xong; wire dần từng cái.
- E3 (E2E) cần tất cả adapter xong.

## Tổng estimate

| Group | Task | Giờ |
|-------|------|-----|
| A | 3 CI read adapters | 6h |
| B | Ticket + migration | 4h |
| C | DDEX builder | 8h |
| D | gRPC + SFTP | 12h |
| E | Export + wire + test | 20h |
| **Tổng** | | **~50h (~2 sprint)** |

## Câu hỏi mở (ĐÃ GIẢI QUYẾT)

1. ✅ **CI export trigger:** CI tự export khi batch upload + `.done` file xuất hiện → ExporterAdapter CI_DEAL = no-op.
2. ✅ **DI switch strategy:** Real adapter wired trực tiếp trong module. Test-double dùng trong unit test qua constructor injection (không cần env var switch).
3. ✅ **PackageBuilder cache:** Dùng filesystem check (`fs.existsSync(outputDir)`) — idempotent, không cần DB cache table.

