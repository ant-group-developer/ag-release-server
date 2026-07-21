# Phase 4 — ACL adapter cho SFTP/CI/gRPC/email + test double

**Priority:** Trung bình · **Status:** ✅ HOÀN THÀNH (2026-07-21) · **Group A–E done · 50 tests (44 unit + 6 integration)**

## Mục tiêu

Impl các port (phase 1) bằng adapter thật, bọc Anti-Corruption Layer. Domain không đổi một dòng khi đổi hệ ngoài.

## Scope

Theo section 9 — mỗi port 1 adapter:
- ✅ `CiImportAdapter`, `CiQaAdapter`, `CiDeliverDesireAdapter` (Group A — **NEW dedicated CI API services** trong `infrastructure/ci-api/`, KHÔNG dùng v3 service trực tiếp)
- ✅ `PostgresTicketAdapter` (Group B — own schema `orchestration_ticket`, integration test testcontainers)
- ✅ `DdexXmlPackageBuilder` (Group C — ErnService2 + BucketService2 + local filesystem + DdexDataMapper + ProcessCodeResolver)
- ✅ `GrpcIdentifierAdapter` (Group D — gRPC UPC/ISRC via UpcService + IsrcService)
- ✅ `SftpUploaderAdapter` (Group D — SftpConnectService + DspRoutingConfigsService)
- ✅ `ExporterAdapter` (Group E — CI_DEAL no-op + STATE51 email via NotificationResendService)
- ✅ Test double in-memory giữ nguyên cho unit/integration test (`infrastructure/test-doubles/`)

## Entry / Exit

- **Entry:** port interface ổn định (phase 1). Test double in-memory đã có sẵn từ Phase 2 (`infrastructure/test-doubles/`) — Phase 4 thay dần bằng adapter thật, giữ nguyên test double cho unit/integration test.
- **Exit:** ✅ 9 adapter thật wired vào module. 50 test xanh. `tsc` sạch cho module.

## File Inventory (10 adapter files + 6 CI API files + 6 test files)

### `infrastructure/adapters/` (10 files)
- `ci-import.adapter.ts` — CiImportAdapter (IngestResultReader)
- `ci-qa.adapter.ts` — CiQaAdapter (QaChecker)
- `ci-deliver-desire.adapter.ts` — CiDeliverDesireAdapter (DeliveryStatusReader)
- `postgres-ticket.adapter.ts` — PostgresTicketAdapter (TicketService)
- `ddex-xml-package-builder.adapter.ts` — DdexXmlPackageBuilder (PackageBuilder)
- `ddex-data-mapper.ts` — pure functions: snapshot → ErnInput2
- `process-code-resolver.ts` — parseProcessCode() → PackageBuildConfig
- `grpc-identifier.adapter.ts` — GrpcIdentifierAdapter (IdentifierProvisioner)
- `sftp-uploader.adapter.ts` — SftpUploaderAdapter (PackageUploader)
- `exporter.adapter.ts` — ExporterAdapter (Exporter: CI_DEAL + STATE51)

### `infrastructure/ci-api/` (6 files)
- `ci-api.config.ts`, `ci-api.module.ts`, `ci-api.service.ts`
- `ci-import-api.service.ts`, `ci-qa-api.service.ts`, `ci-deliver-desire-api.service.ts`

### `infrastructure/adapters/__tests__/` (6 test files, 50 tests)
- `ddex-data-mapper.spec.ts` — 13 tests (snapshot→ErnInput mapping)
- `process-code-resolver.spec.ts` — 9 tests (processCode parsing)
- `postgres-ticket.integration.spec.ts` — 6 integration tests (real DB testcontainers)
- `grpc-identifier.adapter.spec.ts` — 8 tests (UPC/ISRC provisioning)
- `sftp-uploader.adapter.spec.ts` — 5 tests (upload + markBatchDone)
- `exporter.adapter.spec.ts` — 9 tests (CI_DEAL no-op + STATE51 email)

## Todo

- [x] Group A: 3 CI adapter + 6 file `infrastructure/ci-api/` (dedicated HTTP client, 30s timeout, auth)
- [x] Group B: PostgresTicketAdapter + migration + integration test (testcontainers)
- [x] Group C: DdexXmlPackageBuilder + DdexDataMapper + ProcessCodeResolver (DDEX ERN XML + local filesystem + BucketService2)
- [x] Group D: GrpcIdentifierAdapter (gRPC UPC/ISRC) + SftpUploaderAdapter (SFTP/S3 upload)
- [x] Group E: ExporterAdapter (CI_DEAL no-op + STATE51 email via Resend)
- [x] Module wire đủ 9 port → 9 adapter (`distribution-orchestration.module.ts`)
- [x] 7 step-runners registered as providers

## Câu hỏi mở (ĐÃ GIẢI QUYẾT)

- ✅ 9 port cố định chữ ký ở Phase 1; adapter implement, KHÔNG đổi interface.
- ✅ Group C: snapshotId mapping qua `ReleaseSnapshotOrmEntity` + `DdexDataMapper`. processCode resolution qua `ProcessCodeResolver` (`parseProcessCode()`).
- ✅ CI export trigger (Q1): CI tự import khi `.done` file xuất hiện trên SFTP → ExporterAdapter CI_DEAL = no-op.
- ✅ DI switch strategy: real adapter wired trực tiếp, test-double dùng trong unit test qua constructor injection.

