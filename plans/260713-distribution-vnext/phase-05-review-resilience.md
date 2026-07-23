# Phase 5 — Khép vòng lặp Worker + REVIEW gate + Resilience

**Priority:** Cao · **Status:** ✅ DONE (A·B·C·D·E) · **Depends on:** Phase 2–4 ✅ · **Blocks:** UI write-flow, Phase 6

**Progress:** [✅] Khối A [✅] Khối C [✅] Khối B [✅] Khối D [✅] Khối E — **Phase 5 hoàn thành, 294 test pass**

## Context Links

- Kiến trúc: `docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md` §7 (state machine), §8 (queue topology + DLQ), §10 (reliability patterns), §13 (bảo mật)
- Sơ đồ vòng lặp: `docs/flow-release-submit-new/so-do-end-to-end-bullmq-xstate.md` §A (một vòng orchestrator), §B (release chạy xuyên)
- Domain nền (BẤT KHẢ XÂM PHẠM): `src/modules/distribution-orchestration/domain/`
- Handler + runners: `src/modules/distribution-orchestration/application/`
- Phase 2 quyết định #33 (hoãn Worker): `plans/260713-distribution-vnext/phase-02-bullmq-engine.md`

## Overview

Phase cuối để luồng phát hành **chạy được production đầu-cuối**. Gồm 5 khối:

- **Khối A — Khép vòng lặp Worker (BLOCKER):** Step 8 bị hoãn từ Phase 2. Hiện outbox→relay→BullMQ enqueue nhưng KHÔNG có consumer. Làm Worker cho 8 queue + validation runner + write endpoints. Không có khối này → review/retry/resilience đều là code chết.
- **Khối B — REVIEW gate:** cờ tenant `requiresManualReview` + bảng `review` + endpoint approve/reject + RBAC.
- **Khối C — ISSUES/ticket path:** runner hiện `throw` ở nhánh lỗi thay vì mở ticket + phát command channel-fail. Không hoàn thiện → channel không vào ISSUES → RETRY vô nghĩa.
- **Khối D — Resilience:** bulkhead SFTP, circuit breaker CI/SFTP, timeout mỗi bước, poison detection, retry-backoff mapping, DLQ.
- **Khối E — RETRY endpoint:** admin-only, reset subtree ISSUES → resume, guard poison=3.

Thứ tự bắt buộc: **A → C → (B ∥ D ∥ E)**. A là nền; C là tiền đề của E.

## Quyết định đã chốt

| # | Chủ đề | Chốt | Lý do |
|---|--------|------|-------|
| 1 | Worker/consumer | Tính vào Phase 5, làm Khối A đầu tiên | Blocker toàn bộ Phase 5 |
| 2 | Validation logic | Kiểm tra user điền đủ thông tin bắt buộc của release (metadata + asset) trên **snapshot bất biến** | Đúng bounded context; snapshot là nguồn sự thật lúc submit |
| 3 | RETRY policy resolution | Handler đặc biệt hoá `RESET_FOR_RETRY`: wrap policy gốc vào `RetryExecutionPolicy` tại điểm dispatch. KHÔNG thêm cột `wrapped_type` | `RetryExecutionPolicy` chỉ lật `canRetry()=true`, phần còn lại delegate policy gốc → channel reset resume đúng process. Sửa 1 chỗ, không đụng DB |
| 4 | Rate-limit SFTP | Tĩnh (hardcode config) cho Phase 5 | KISS; đọc theo DSP là YAGNI |
| 5 | Poison limit | Giữ hardcode `POISON_LIMIT=3` global (không config theo tenant) | Khớp spec; chưa có nhu cầu thực. Review flag thì bắt buộc theo tenant (kiến trúc đã chốt) |
| 6 | DLQ | Dùng BullMQ failed-set native (không tạo `dist.dlq.*` tường minh). Lỗi `RetryLimitExceededError` (poison) → KHÔNG retry, vào failed ngay | Failed-set đủ (giữ job + metadata + requeue). Queue DLQ riêng = YAGNI |

---

## Khối A — Khép vòng lặp Worker (BLOCKER)

### Vấn đề

```
HTTP(chưa có) → handler → outbox → OutboxRelay → BullMQ.enqueue → ❌ KHÔNG AI CONSUME
```

- Không có BullMQ Worker nào trong module (chỉ `analytics` có `new Worker` toàn repo).
- 7 step-runner đã Injectable + trả `DistributionCommand`, nhưng `.run()` chỉ được gọi trong E2E test (loop driver giả lập).
- Controller chỉ có GET timeline/stream/metrics — không endpoint write.
- Không có trigger `MARK_VALIDATED` (không queue/runner validate).

### Kiến trúc Worker

Mỗi queue một Worker. Worker xử lý theo 2 nhóm:

1. **`dist.orchestrate`** → gọi thẳng `OrchestrateHandler.handle(command)`. Job payload mang cả `DistributionCommand` (serialize trong outbox/enqueue).
2. **7 runner-queue** (`dist.provision-id`, `dist.build-package`, `dist.sftp-upload`, `dist.ci-import-check`, `dist.ci-qa-check`, `dist.export-batch`, `dist.status-sync`) → dispatch đúng runner → runner trả `DistributionCommand | null` → nếu có command, enqueue lại vào `dist.orchestrate` (KHÔNG gọi handler trực tiếp — giữ decouple + at-least-once qua jobId). `null` = re-poll (delayed job).

### Files tạo mới

- `infrastructure/workflow/distribution-worker.service.ts` — `DistributionWorkerService implements OnModuleInit, OnModuleDestroy`. Tạo 8 BullMQ `Worker` (lazy theo queue), map queue→runner, set concurrency per queue (Khối D). `onModuleInit` start; `onModuleDestroy` close.
- `infrastructure/workflow/runner-dispatch.map.ts` — map `QueueName → (payload) => Promise<DistributionCommand|null>`. Inject 7 runner + handler. Trung tâm dispatch, tách khỏi worker lifecycle.
- `application/step-runners/validate.runner.ts` — `ValidateRunner`: load snapshot → kiểm tra trường bắt buộc → clean thì trả `MarkValidatedCommand` (đọc cờ `requiresManualReview` từ tenant), lỗi thì mở ticket VALIDATION + trả `FlagValidationErrorsCommand`.
- `application/ports/release-snapshot-reader.port.ts` — port đọc snapshot metadata để validate (`RELEASE_SNAPSHOT_READER` Symbol). Domain không biết TypeORM.
- `infrastructure/adapters/release-snapshot.reader.ts` — adapter đọc `release_snapshot` (jsonb) qua repo.
- `infrastructure/http/distribution-command.controller.ts` — endpoint write (tách khỏi query controller):
  - `POST /distributions` — submit: tạo snapshot + enqueue SUBMIT vào `dist.orchestrate`.
- `application/distribution-command.service.ts` — service enqueue command vào `dist.orchestrate` qua `WorkflowEnginePort` (điểm vào duy nhất cho HTTP → queue).

### Files sửa

- `application/ports/workflow-engine.port.ts` — thêm queue `dist.validate` vào `QueueName` union; `JobPayload` mang optional `command?: DistributionCommand` cho `dist.orchestrate`.
- `application/orchestrate.handler.ts` — `buildOutbox`: VALIDATING → enqueue `dist.validate` (thay vì `[]` chờ external). Đây là trigger validation còn thiếu.
- `application/channel-stage-to-queue.ts` — không đổi (đã map đủ 7 queue).
- `distribution-orchestration.module.ts` — wire `DistributionWorkerService`, `RunnerDispatchMap`, `ValidateRunner`, `RELEASE_SNAPSHOT_READER`, `DistributionCommandController`, `DistributionCommandService`.

### Điểm chú ý

- **Serialize command trong payload:** `dist.orchestrate` job cần mang nguyên `DistributionCommand`. Outbox payload hiện chỉ có `{distributionId, correlationId, key}`. Cần mở rộng: runner trả command → enqueue với command trong payload → worker `dist.orchestrate` đọc `payload.command` gọi handler.
- **Stateless + idempotent:** worker load state đầu mỗi vòng; jobId deterministic đã có.
- **Không block khi chờ:** runner trả `null` → worker enqueue lại queue đó với `delayMs` (re-poll). KHÔNG `sleep`.

### Todo Khối A

- [✅] Thêm `dist.validate` vào QueueName + `command?` vào JobPayload
- [✅] `ReleaseSnapshotReader` port + adapter
- [✅] `ValidateRunner` (kiểm tra trường bắt buộc, đọc cờ tenant)
- [✅] `RunnerDispatchMap` (queue → runner)
- [✅] `DistributionWorkerService` (8 Worker, lifecycle, concurrency)
- [✅] `buildOutbox` VALIDATING → `dist.validate`
- [✅] `DistributionCommandService` + `DistributionCommandController` (POST submit)
- [✅] Wire module đầy đủ
- [✅] Integration test: submit → validate → provision → build → deliver → LIVE qua Worker thật (testcontainers Redis+PG)

**Status:** ✅ DONE (2026-07-21) + review fixes applied
**Tests:** 239 pass (runInBand — song song bị flaky testcontainer "starting up")

**Review fixes (2026-07-21) — 5 lỗi sau review Khối A:**
1. **Re-poll (nghiêm trọng):** `processJob` cũ `return` khi runner trả null → mọi bước WAIT (ci-import, status-sync) kẹt vĩnh viễn. Fix: null → re-enqueue CÙNG queue với `delayMs` (`repoll-delay.config.ts`: import 5m, status-sync 1h) + `pollAttempt` counter → jobId unique mỗi lần (tránh BullMQ dedupe chặn). `JobPayload.pollAttempt?` mới.
2. **Snapshot (nghiêm trọng):** submit cũ nhận `snapshotId` từ body, KHÔNG tạo snapshot → validate luôn "snapshot not found". Fix: `ReleaseSnapshotWriter` port + `ReleaseSnapshotWriterAdapter` (bọc `ReleaseQueryService.findOneReleaseFull` → JSON round-trip → INSERT release_snapshot). Service submit tạo snapshot trước khi enqueue. Import `ReleaseModule`.
3. **Auth:** submit endpoint dùng `@User()` lấy `tenantId` từ JWT (global JwtAuthGuard+PolicyGuard đã có), KHÔNG nhận tenantId từ body. `SubmitDistributionDto` với `@IsUUID/@IsEnum/@ArrayNotEmpty`.
4. **DTO enum:** `type` validate `@IsEnum(ExecutionTypeEnum)` thay `as any` + comment sai (`INITIAL` → `INITIAL_RELEASE`).
5. **Idempotency:** key ổn định `submit:{releaseId}:{type}` (hoặc client cấp) thay `Date.now()` → double-submit dedupe.

**Fix phụ (field mismatch):** validate territory dùng `releaseTerritory` (OneToOne: worldwide HOẶC ≥1 selectedCountries), KHÔNG phải `territories[]` — đối chiếu Release entity thật. Reader + port + runner đồng bộ.

**Test mới:** `validate.runner.spec.ts` (6 case: clean/missing-field/territory×2/track-isrc/snapshot-missing), `distribution-worker.repoll.spec.ts` (4 case: orchestrate no-enqueue/command→orchestrate/null→re-poll/pollAttempt tăng).

**CÒN LẠI (chưa trong scope fix này):** #6 (runner command bypass outbox — an toàn nhờ job retry + idempotent, chỉ cần comment rõ) chưa xử lý; E2E vẫn bypass validation (drain dist.validate). Khối B sẽ nối tenant.requiresManualReview thật (hiện hardcode false ở validate.runner).

---

## Khối C — ISSUES/ticket path trong runner

### Vấn đề

Mọi runner hiện `throw` ở nhánh lỗi thay vì mở ticket + phát command channel-fail:

| Runner | Dòng | Hiện tại | Cần |
|--------|------|----------|-----|
| `sftp-upload.runner.ts` | 74 | throw | `ACTION_FAIL` + ticketRef (UPLOAD_FAIL) |
| `qa.runner.ts` | 51 | throw | `GATE_FAIL` + ticketRef (QA_FLAG) |
| `ci-import-check.runner.ts` | 66 | throw | `WAIT_FAIL` + ticketRef (INGEST_FAIL) |
| `status-sync.runner.ts` | 70 | throw | `WAIT_FAIL` + ticketRef (PARTNER_FAIL) |

`TicketService` port + `PostgresTicketAdapter` đã có (Phase 4 Group B) nhưng runner chưa inject. Channel interpreter đã ép `ticketRef` (INV-C6) cho mọi path vào ISSUES. Không hoàn thiện → channel không bao giờ vào ISSUES → RETRY (Khối E) không có gì để reset.

### Phân biệt 2 loại lỗi (quan trọng)

- **Lỗi tạm thời** (SFTP timeout, mạng chập chờn): để BullMQ retry/backoff (Khối D). Runner throw → worker retry theo `attempts`.
- **Lỗi cạn attempts / lỗi nghiệp vụ** (upload fail sau 3 lần, QA còn flag, import problem, DSP reject): mở ticket → phát command channel-fail → channel vào ISSUES. KHÔNG throw.

Ranh giới: runner nhận biết qua kết quả port (vd `result.ok===false` sau khi uploader đã tự xử lý transient) hoặc số lần retry BullMQ (`job.attemptsMade >= max`). ACTION_FAIL để interpreter tự đếm `retryCount` vs `RetryPolicy.maxAttempts` — cạn thì interpreter tự chuyển ISSUES.

### Files sửa

- `application/step-runners/sftp-upload.runner.ts` — inject `TICKET_SERVICE`. Fail → `ticketService.open({reason: UPLOAD_FAIL, ...})` → trả `ACTION_FAIL` kèm ticketRef. Interpreter đếm retry; cạn → ISSUES.
- `application/step-runners/qa.runner.ts` — flagged → `open({reason: QA_FLAG, detail: flags})` → `GATE_FAIL` + ticketRef.
- `application/step-runners/ci-import-check.runner.ts` — problem → `open({reason: INGEST_FAIL})` → `WAIT_FAIL` + ticketRef.
- `application/step-runners/status-sync.runner.ts` — rejected → `open({reason: PARTNER_FAIL})` → `WAIT_FAIL` + ticketRef.
- `application/commands/distribution.command.ts` — `ApplyChannelInputCommand.input` đã hỗ trợ ticketRef qua `ChannelInput` type (kiểm tra `channel-interpreter.types.ts`). Nếu thiếu, mở rộng.

### Điểm chú ý

- **Idempotency ticket:** `TicketService.open()` idempotent theo `key`. Runner dùng `payload.key` làm idempotency key → re-run không tạo ticket kép.
- **Ticket resolve khi RETRY:** khi admin retry (Khối E), reset channel về stage trước — cân nhắc `ticketService.resolve()` cho ticket cũ (hoặc để RETRY event tự đánh dấu). Chốt: resolve ticket khi RESET thành công.

### Todo Khối C

- [✅] Inject TICKET_SERVICE vào 4 runner
- [✅] sftp-upload: fail → open(UPLOAD_FAIL) + ACTION_FAIL
- [✅] qa: flagged → open(QA_FLAG) + GATE_FAIL
- [✅] ci-import-check: problem → open(INGEST_FAIL) + WAIT_FAIL
- [✅] status-sync: rejected → open(PARTNER_FAIL) + WAIT_FAIL
- [✅] Unit test mỗi runner: happy + fail→ticket→command
- [✅] Integration test: channel → ISSUES → aggregate PARTIALLY_DISTRIBUTED

**Status:** ✅ DONE (2026-07-21) — 4 runner inject ticket service; unit + integration pass.
**Tests:** 263 pass (runInBand), +24 so với baseline 239 sau Khối A.

**Review fixes (2026-07-21) — sau review Khối C, 3 lỗi:**
1. **SFTP mở ticket quá sớm + key trôi (nghiêm trọng):** `sftp-upload.runner` cũ mở ticket + gắn
   ticketRef ở MỖI lần `ok:false`, kể cả khi interpreter còn retry-in-place (chưa ISSUES). Vì
   interpreter drop `ticketRef` trên ACTION_FAIL không-cạn → ticket mồ côi mỗi vòng. Thêm nữa key
   ticket derive từ `payload.key` (trôi `:fail` mỗi turn) → mỗi lần fail 1 ticket mới.
   **Fix:** getter domain read-only `ChannelDelivery.willExhaustOnNextActionFail` (mirror INV-C2)
   → runner chỉ mở ticket + gắn ticketRef khi CẠN (lần fail tới → ISSUES); còn lại trả ACTION_FAIL
   trần. Quyết định #(a): runner quyết theo attempt-count, nhưng đếm bằng interpreter counter
   (`channel.retryCount` + RetryPolicy) — KHÔNG dùng `job.attemptsMade` (sẽ lệch pha interpreter).
2. **Key ticket không ổn định (nghiêm trọng):** thêm `ticket-idempotency-key.ts` →
   `${channelId}:${reason}:g${dist.retryCount}`. Ổn định trong 1 retry-generation, đổi khi admin
   RESET (Khối E bump retryCount). Áp cho cả 4 runner. Idempotent re-run → 1 ticket duy nhất.
3. **E2E spec vỡ compile (C-1):** `orchestrate.e2e.spec` dựng SftpUpload/StatusSync runner thiếu
   arg `ticketService` → cả suite e2e không chạy (số "259 pass" ảo). Fix: inject
   `InMemoryTicketService`. Suite e2e chạy lại xanh.

**Test mới/cập nhật:** `sftp-upload.runner.spec` (rehydrate ChannelDelivery thật; case
non-exhaust=KHÔNG ticket, exhaust=CÓ ticket + key `ch-1:UPLOAD_FAIL:g0`); 3 spec WAIT/GATE assert
đúng stable key; `channel-issues-partial.integration.spec` (2 case: 1 live + 1 rejected →
ISSUES + PARTIALLY_DISTRIBUTED + đúng 1 ticket; re-run poll idempotent → vẫn 1 ticket).

**CÒN LẠI:** SFTP business-fail (`result.ok===false`) hiện vẫn là nhánh chờ Khối D — adapter thật
`SftpUploaderAdapter.upload()` chỉ `throw` (transient) hoặc `{ok:true}`, chưa bao giờ trả
`{ok:false}`. Cầu nối "BullMQ cạn attempts → ISSUES" là việc Khối D (retry-backoff mapping). Nhánh
ACTION_FAIL đã đúng logic + có test, nhưng production chỉ kích hoạt khi Khối D map attempts.

---

## Khối B — REVIEW gate

### Vấn đề

Domain đã sẵn (`IN_REVIEW`, `markValidated(requiresReview)`, `approveReview`, `rejectReview`). Thiếu: cờ tenant, bảng review, endpoint, RBAC.

### Files tạo mới

- Migration `xxxxx-AddTenantRequiresManualReview.ts` — `ALTER TABLE tenants ADD requires_manual_review boolean DEFAULT false`.
- `infrastructure/persistence/review.orm-entity.ts` — bảng `review` (spec §11): `id, distribution_id, reviewer_id, status(pending/approved/rejected), note, decided_at, created_at`.
- Migration `xxxxx-CreateReviewTable.ts`.
- `application/ports/review-repository.port.ts` — `REVIEW_REPOSITORY` Symbol: `create(distributionId)`, `decide(id, reviewerId, status, note)`, `findByDistribution(id)`.
- `infrastructure/persistence/review.repository.ts` — adapter.
- `application/dto/review-decision.dto.ts` — `{note?: string}` cho reject.

### Files sửa

- `src/modules/tenant/tenant.entity.ts` — thêm cột `requiresManualReview: boolean` (default false).
- `application/step-runners/validate.runner.ts` (Khối A) — đọc `tenant.requiresManualReview` khi tạo `MarkValidatedCommand`. Nguồn tenant: `dist.tenantId` → query tenant repo.
- `infrastructure/http/distribution-command.controller.ts` — thêm:
  - `POST /distributions/:id/review/approve` — RBAC admin/reviewer → tạo review row (approved) → enqueue `APPROVE_REVIEW`.
  - `POST /distributions/:id/review/reject` — RBAC → mở ticket REVIEW_REJECT → review row (rejected) → enqueue `REJECT_REVIEW` kèm ticketRef + note.
- `application/distribution-command.service.ts` — thêm method `approveReview`/`rejectReview` (ghi review row + enqueue command atomic-ish).
- `distribution-orchestration.module.ts` — wire `REVIEW_REPOSITORY`, import TenantModule/tenant repo.

### RBAC

- Dùng `AccessControlService` + `UserType.ADMIN` sẵn có (pattern `distribution.controller.ts:48`).
- Approve/reject: chỉ ADMIN (hoặc reviewer role — chốt với nghiệp vụ; mặc định ADMIN).
- Guard tenant scope: reviewer chỉ duyệt release thuộc tenant mình (dùng `AccessControlService`).

### Điểm chú ý

- **Human signal = resume:** sau approve, aggregate `approveReview` tự chuyển PROVISIONING_IDS/DELIVERING → `buildOutbox` enqueue bước kế. Không cần cơ chế signal riêng — chỉ là 1 command.
- **Review row vs ticket:** review row = audit quyết định (ai/khi nào/note). Ticket REVIEW_REJECT = điểm hỏng để user sửa (ACTION_REQUIRED). Hai bảng khác mục đích.
- **Reject → resubmit:** reject đưa về ACTION_REQUIRED; user sửa → `RESUBMIT` → VALIDATING lại. Endpoint resubmit có thể tái dùng submit flow.

### Todo Khối B

- [✅] Cột `requires_manual_review` + migration
- [✅] Bảng `review` (distribution_review) + ORM entity + migration
- [✅] ReviewRepository port + adapter
- [✅] ValidateRunner đọc cờ tenant (qua TenantReader port)
- [✅] Endpoint approve/reject + RBAC (permission `release_review.approve/reject` + tenant-scope)
- [✅] DistributionCommandService.approveReview/rejectReview (guard tenant-scope + IN_REVIEW state)
- [✅] Wire module (+ TenantModule cho scope)
- [✅] Integration test: submit (tenant review=on) → IN_REVIEW → approve → tiếp; → reject → ACTION_REQUIRED

**Status:** ✅ DONE (2026-07-21) — 273 test pass (+10 vs baseline 263 Khối C).

**Files tạo:**
- `application/ports/review-repository.port.ts` (REVIEW_REPOSITORY) + `infrastructure/persistence/review.orm-entity.ts` + `review.repository.ts`
- `application/ports/tenant-reader.port.ts` (TENANT_READER) + `infrastructure/adapters/tenant.reader.ts`
- `infrastructure/http/dto/review-decision.dto.ts`
- Migration `1784500000000-AddTenantRequiresManualReview` + `1784500000001-CreateDistributionReview`
- Test double `in-memory-review-repository.ts`; test `review-gate.integration.spec`, `distribution-command-review.spec`

**Files sửa:** `tenant.entity.ts` (+cột), `validate.runner.ts` (đọc cờ thật thay hardcode false),
`distribution-command.service.ts` (+approveReview/rejectReview), `distribution-command.controller.ts`
(+2 endpoint admin-only), `distribution-orchestration.module.ts` (wire 2 provider + ReviewOrmEntity),
`validate.runner.spec.ts` (+ctor tenantReader + case flag=true).

**Quyết định phát sinh (đã chốt với user):**
- RBAC **permission-based**: `@RequirePermissions(RELEASE_REVIEW.APPROVE / .REJECT)` qua PolicyGuard
  global (system admin bypass). KHÔNG hardcode admin-only.
- **Tenant-scope**: reviewer chỉ duyệt release thuộc tenant mình + descendants. Controller resolve
  `TenantService.getDescendantIds(user.tenantId)` (self-inclusive) → truyền `allowedTenantIds` xuống
  service; service load dist, check `dist.tenantId ∈ allowedTenantIds` → 403 nếu ngoài scope. System
  admin → undefined (bỏ qua scope). Service cũng guard state IN_REVIEW (409) + tồn tại (404).
- Review row = audit (ai/khi nào/note); ticket REVIEW_REJECT = điểm hỏng cho user sửa. Tách 2 bảng.
- Ticket reject dùng key ổn định `review-reject:${distributionId}` → double-reject không tạo ticket kép.
- Bảng đặt tên `distribution_review` (không phải `review` trần) để tránh va tên global.
- RESUBMIT endpoint (ACTION_REQUIRED→VALIDATING) hoãn sang UI write-flow (user OK).

---

## Khối D — Resilience patterns

### Áp dụng trên Worker layer (Khối A)

| Pattern | Vấn đề | Cách làm |
|---------|--------|----------|
| **Bulkhead SFTP** | SFTP nghẽn kéo sập hệ | Worker `dist.sftp-upload` set concurrency thấp riêng (vd 2), tách pool khỏi queue khác. Rate-limit per host tĩnh (BullMQ `limiter: {max, duration}`) |
| **Circuit breaker CI/SFTP** | CI/SFTP sập → ngừng đập, chờ hồi | Bọc adapter CI + SFTP trong breaker (opossum hoặc tự viết): mở mạch khi lỗi liên tục, fail-fast, half-open thử lại |
| **Timeout/deadline** | Bước treo vô hạn | CI đã có timeout 30s. Thêm timeout cho SFTP upload + gRPC provision + build. Quá hạn → throw → BullMQ retry → cạn → ISSUES |
| **Poison detection** | Release lỗi lặp vô hạn | Domain `POISON_LIMIT=3` đã có. Worker bắt `RetryLimitExceededError` → KHÔNG retry, để job vào failed ngay |
| **Retry backoff mapping** | Adapter hardcode attempts=1 | Map `RetryPolicy.sftpDefault()` (3 lần, 30s exp) vào `EnqueueOptions.attempts` + backoff per queue |
| **DLQ** | Job chết cần người xem | BullMQ failed-set native (`removeOnFail` đã có). Không tạo `dist.dlq.*` |

### Files tạo mới

- `infrastructure/resilience/circuit-breaker.ts` — wrapper breaker chung (state: closed/open/half-open, threshold, cooldown). Dùng cho CI + SFTP adapter.
- `infrastructure/resilience/queue-concurrency.config.ts` — map `QueueName → {concurrency, limiter?}` tĩnh. `dist.sftp-upload` concurrency thấp + limiter per host.
- `infrastructure/resilience/with-timeout.ts` — helper `Promise.race` timeout cho external call.

### Files sửa

- `infrastructure/workflow/distribution-worker.service.ts` (Khối A) — đọc `queue-concurrency.config` set concurrency + limiter mỗi Worker. Bắt `RetryLimitExceededError` → không retry.
- `infrastructure/workflow/bullmq-workflow.adapter.ts` — `enqueue` đọc backoff/attempts theo queue (thay hardcode `attempts ?? 1`). SFTP: 3 lần exp 30s.
- `infrastructure/adapters/sftp-uploader.adapter.ts` — bọc `with-timeout` + circuit breaker quanh `uploadFolder`.
- `infrastructure/adapters/grpc-identifier.adapter.ts` — thêm timeout.
- CI adapter (`ci-import.adapter.ts`, `ci-qa.adapter.ts`, `ci-deliver-desire.adapter.ts`) — bọc circuit breaker (CI đã có timeout 30s).

### Điểm chú ý

- **Bulkhead ≠ rate-limit:** bulkhead = giới hạn concurrency (isolation lỗi); rate-limit = giới hạn tốc độ per host. SFTP cần cả hai.
- **Circuit breaker per host/service:** breaker CI tách breaker SFTP. Nếu SFTP host A sập không mở mạch host B (nâng cao — Phase 5 làm breaker per-service, per-host là follow-up).
- **Poison vs BullMQ attempts:** BullMQ attempts = retry lỗi transient tầng job. Poison=3 = retry tầng nghiệp vụ (admin reset subtree). Hai tầng độc lập.

### Todo Khối D

- [✅] `queue-resilience.config` (SFTP concurrency thấp 2 + limiter tĩnh 5/1s)
- [✅] Worker đọc config set concurrency/limiter per-queue
- [✅] `circuit-breaker` wrapper (tự viết, không opossum) + bọc SFTP + CI import adapter
- [✅] `with-timeout` + áp SFTP uploadFolder (120s). CI đã có timeout 30s ở CiApiService.
- [✅] Backoff mapping per queue trong bullmq adapter (SFTP 3x exp 30s, khớp RetryPolicy)
- [✅] Worker bắt RetryLimitExceededError → UnrecoverableError (không retry, vào failed-set)
- [✅] Test: breaker (6 case state machine), timeout (3), config (4)

**Status:** ✅ DONE (2026-07-21) — 294 test pass (+13 vs 281 sau Khối E).

**Files tạo:**
- `infrastructure/resilience/with-timeout.ts` (Promise.race + TimeoutError, clear timer)
- `infrastructure/resilience/circuit-breaker.ts` (closed/open/half-open, tự viết, inject `now` để test)
- `infrastructure/resilience/queue-resilience.config.ts` (concurrency+limiter | attempts+backoff per queue)
- Test: `circuit-breaker.spec`, `with-timeout.spec`, `queue-resilience.config.spec`

**Files sửa:**
- `distribution-worker.service.ts` — đọc `queueConcurrency` set concurrency+limiter; catch
  RetryLimitExceededError → `UnrecoverableError` (DLQ native, không retry); bỏ hardcode `attempts:3`
- `bullmq-workflow.adapter.ts` — `enqueue` đọc `queueRetry` (attempts+backoff per queue) thay
  hardcode `attempts??1` + `delay:1000`. Caller vẫn override được `attempts`.
- `sftp-uploader.adapter.ts` — `uploadFolder` bọc `breaker(withTimeout(...))`. Transient throw → retry.
- `ci-import.adapter.ts` — `getImportBatch` bọc breaker.

**Quyết định phát sinh:**
- **Circuit breaker tự viết** (không thêm dep opossum) — KISS, đủ closed/open/half-open per-service.
  Per-host là follow-up.
- **DLQ = BullMQ failed-set native** (`removeOnFail: 1000`), không tạo `dist.dlq.*` (quyết định #6).
  Poison → `UnrecoverableError` vào failed-set ngay.
- **SFTP vẫn KHÔNG trả `ok:false`**: mọi lỗi SFTP là transient (mạng/timeout) → throw → retry →
  cạn attempts → failed-set. Nhánh `result.ok===false` của Khối C vẫn là dead branch (chờ khi có
  DSP thật trả lỗi nghiệp vụ dứt khoát). "SFTP cạn attempts → ISSUES qua ACTION_FAIL" cần worker
  bắt final-attempt (job.attemptsMade) → phát ACTION_FAIL — GHI NHẬN là gap còn lại, KHÔNG làm ở
  Phase 5 (spec Khối D dừng ở failed-set; ISSUES-hoá SFTP là mở rộng sau).

---

## Khối E — RETRY endpoint (admin-only)

### Vấn đề & gap

Domain `resetForRetry` guard `policy.canRetry()` — chỉ `RetryExecutionPolicy` trả true. Handler hiện gọi `policies.resolve(dist.type)` → INITIAL/UPDATE/TAKEDOWN policy → `canRetry()=false` → **luôn throw**. RETRY không phải type lưu trong DB (mutate aggregate cũ). Fix theo quyết định #3.

### Files sửa

- `application/orchestrate.handler.ts` — `applyResetForRetry`: wrap policy gốc:
  ```ts
  const base = this.policies.resolve(dist.type);
  const retryPolicy = new RetryExecutionPolicy(base);
  dist.resetForRetry(cmd.scope, retryPolicy, this.clock);
  ```
- `infrastructure/http/distribution-command.controller.ts` — `POST /distributions/:id/retry` — RBAC admin-only → body `{channelIds?: string[]}` → enqueue `RESET_FOR_RETRY` với scope.
- `application/distribution-command.service.ts` — method `retry(distributionId, scope, user)`.

### Điểm chú ý

- **Guard poison:** `resetForRetry` throw `RetryLimitExceededError` khi `retryCount>=3`. Controller bắt → trả HTTP 409 (không retry thêm, cần xử lý thủ công).
- **Scope:** không truyền channelIds → reset tất cả channel ISSUES. Truyền → chỉ reset các channel đó (spec: chọn nhánh lỗi).
- **LIVE giữ nguyên:** domain đã lo (chỉ reset channel ISSUES, không đụng LIVE).
- **Resolve ticket cũ:** sau reset thành công, resolve ticket của channel được reset (nối Khối C).

### Todo Khối E

- [✅] Handler wrap RetryExecutionPolicy cho RESET_FOR_RETRY
- [✅] Endpoint POST /:id/retry + RBAC (permission release_audio/video.update + tenant-scope)
- [✅] Poison → HTTP 409 (service pre-validate `dist.retriesExhausted`, không để worker throw chìm)
- [✅] Resolve ticket khi reset thành công (handler best-effort sau commit)
- [✅] Test: PARTIALLY_DISTRIBUTED → retry → DELIVERING (LIVE giữ nguyên); poison=3 → 409

**Status:** ✅ DONE (2026-07-21) — 281 test pass (+8 vs 273 sau Khối B).

**Files tạo:** `infrastructure/http/dto/retry-distribution.dto.ts`; test
`distribution-command-retry.spec`, `retry-reset.integration.spec`.

**Files sửa:**
- `distribution.aggregate.ts` — +getter `retriesExhausted` (mirror POISON_LIMIT) + `issuesChannelIds`
- `orchestrate.handler.ts` — `applyResetForRetry` wrap `RetryExecutionPolicy` (quyết định #3);
  `handle()` chụp ticket channel ISSUES-in-scope TRƯỚC apply, resolve SAU commit (best-effort,
  optional `TICKET_SERVICE` qua `@Optional()` → test 4-arg cũ vẫn chạy)
- `distribution-command.service.ts` — +`retry()`: pre-validate exists(404)/scope(403)/state(409)/
  poison(409) → enqueue RESET_FOR_RETRY. `enqueueOrchestrate` mở rộng type nhận ResetForRetryCommand
- `distribution-command.controller.ts` — +POST `/:id/retry` @RequirePermissions + resolveScope

**Quyết định phát sinh:**
- **Poison→409 đồng bộ:** reset chạy async ở worker → `RetryLimitExceededError` không về được HTTP.
  Service pre-validate `dist.retriesExhausted` trước enqueue. Domain guard vẫn là net cuối (worker).
- **Resolve ticket ngoài tx, best-effort:** reset đã commit; resolve lỗi không rollback (nuốt lỗi) —
  reset idempotent (channel rời ISSUES) nên job retry không reset kép.
- **RBAC retry** dùng `release_audio/video.update` (retry = recovery cấp release), không tạo
  permission mới. Tenant-scope như review.

---

## Thứ tự triển khai

```
Khối A (khép vòng lặp) ──┬──▶ Khối C (ISSUES/ticket) ──▶ Khối E (RETRY)
                         │
                         ├──▶ Khối B (REVIEW gate)
                         │
                         └──▶ Khối D (resilience)
```

A trước tiên (blocker). C là tiền đề E. B/D/E chạy song song sau A+C.

## Success Criteria

- Submit release qua HTTP → chạy đầu-cuối qua Worker thật tới LIVE (không cần loop driver test).
- Tenant bật `requiresManualReview` → dừng IN_REVIEW; approve → tiếp; reject → ACTION_REQUIRED.
- Channel lỗi → mở ticket → ISSUES (không throw mất dấu).
- Admin retry → reset subtree ISSUES → resume; poison=3 → chặn.
- SFTP nghẽn không kéo sập queue khác (bulkhead); CI sập → circuit breaker fail-fast.
- Mỗi file < 200 LOC. `no-framework-import.spec.ts` xanh (domain sạch).

## Risk Assessment

- **Worker + relay đua enqueue trùng:** jobId deterministic + BullMQ dedupe + side-effect idempotent → an toàn.
- **Serialize command trong payload:** command phải JSON-serializable (đã là plain object). VO trong command? Kiểm tra `RetryScope`/`ChannelInput` không chứa class instance.
- **Circuit breaker false-open:** ngưỡng quá nhạy → chặn oan. Chọn threshold thận trọng + log.
- **v3 song song:** Phase 5 KHÔNG đụng v3; write endpoint mới tách route riêng.

## Security Considerations

- RBAC: approve/reject/retry admin-only (hoặc reviewer role) qua `AccessControlService`.
- Tenant scope: reviewer chỉ duyệt release tenant mình.
- Credential SFTP/CI không log giá trị.
- Idempotency key chống replay ở submit + review + retry endpoint.

## Unresolved Questions

- ~~Reviewer role riêng hay chỉ ADMIN duyệt?~~ **CHỐT (Khối B):** permission-based `release_review.approve/reject` + tenant-scope; system admin bypass.
- ~~Validation: trường bắt buộc chính xác?~~ **CHỐT (Khối A):** ValidateRunner check title/label/genre/format/priceTier/cLine/pLine/releaseDate + ≥1 track(title+isrc)/artist/coverArt + territory.
- ~~Circuit breaker: tự viết hay opossum?~~ **CHỐT (Khối D):** tự viết (KISS, không thêm dep), per-service.
- Export batch (`dist.export-batch`): admin trigger thủ công hay auto theo lịch? (treo từ Phase 4 Group E — chốt trước khi hoàn thiện runner export)

## Follow-up (ngoài scope Phase 5 — có thiết kế riêng khi làm)

### FU-1 — SFTP-exhausted → ISSUES (defer, quyết định 2026-07-21)

**Vấn đề:** khi SFTP upload cạn retry BullMQ (3 lần), job vào failed-set nhưng aggregate vẫn kẹt
DELIVERING vĩnh viễn — không lên UI, RETRY (Khối E) không cứu được (chỉ chạy từ PARTIALLY/FAILED).
Nhánh `result.ok===false` trong `sftp-upload.runner` (Khối C) là **dead branch** vì
`SftpUploaderAdapter.upload()` chỉ throw (transient) hoặc trả `ok:true`.

**Vì sao KHÓ — hai bộ đếm retry không ăn khớp:**
- BullMQ `attemptsMade`: nhích khi runner *throw*; interpreter không thấy → `channel.retryCount` giữ 0.
- Interpreter `retryCount` vs `RetryPolicy.maxAttempts`: chỉ nhích khi runner *trả* ACTION_FAIL.
- SFTP hiện đi đường throw → interpreter chưa bao giờ đếm. Nếu worker gọi ACTION_FAIL ở lần thất bại
  cuối, interpreter thấy retryCount=0<3 → `willExhaustOnNextActionFail=false` → **lại retry** → lặp.

**Hai hướng (chốt trước khi code):**
1. Thêm input interpreter kiểu "ACTION fail dứt điểm → ISSUES ngay bất kể đếm" — **sửa domain + invariant**
   (vùng nhạy, từng có bug ở Khối C).
2. Bỏ retry BullMQ cho SFTP, để interpreter tự đếm + re-enqueue — **mất backoff native** (re-enqueue
   interpreter đi ngay, không delay), config backoff Khối D thành vô dụng cho SFTP → phải làm lại.

**Vì sao DEFER (không làm ở Phase 5):** SFTP cạn retry gần như luôn là **sự cố hạ tầng** (sai
credential/host sập/hết đĩa/mạng) — việc của **ops**, không phải lỗi nghiệp vụ user tự sửa. Ticket
"SFTP upload failed" gửi label thì họ bó tay. Đổi một thay đổi domain rủi ro cao lấy việc biến sự cố
ops thành ticket user là **không tương xứng**, nhất là hệ chưa chạy live. Failed-set + alert cho ops
là mô hình đúng hơn cho loại lỗi này.

**Điều kiện để làm FU-1 sau:** (a) có tích hợp SFTP/DSP thật để test tới kịch bản cạn retry; (b) chốt
hướng 1 hay 2; (c) xác định rõ SFTP-hỏng-vĩnh-viễn là tình huống **user xử lý trên UI** (mới bõ đụng
domain) hay **ops xử lý** (thì chỉ cần alert trên failed-set, KHÔNG cần FU-1).

**Lỗ hổng tạm chấp nhận đến khi làm FU-1:** release có channel SFTP hỏng hẳn sẽ kẹt DELIVERING, chỉ
khôi phục bằng requeue thủ công trong Redis (thao tác ops). Chấp nhận vì hệ chưa live.

### FU-2 — Vệ sinh layering: TICKET_SERVICE token

7 file `application/` import `TICKET_SERVICE` từ `infrastructure/adapters/postgres-ticket.adapter`
(ngược chiều hexagonal). Pattern có từ Khối A, Khối B–E nhân rộng. Gom symbol về cạnh port
`domain/ports/ticket-service.port.ts` (hoặc file token `application/`) + sửa 7 import. Rẻ, thuần cơ học,
không đổi hành vi. `no-framework-import.spec` vẫn xanh (token là Symbol, không phải framework) nên
không bị guard bắt — cần làm thủ công.

### FU-3 — Test coverage bù

- Worker poison→`UnrecoverableError`: chỉ test ở tầng domain (throw `RetryLimitExceededError`), chưa có
  test worker convert sang UnrecoverableError. Logic đơn giản nhưng nên có 1 case.
- BullMQ e2e (`bullmq-e2e.integration.spec`) cover relay→adapter→Redis (enqueue/dedupe/delay), CHƯA
  cover worker consume với concurrency/limiter/breaker thật. Resilience mới test ở tầng unit.

### FU-4 — Cross-block ops (trước production)

- Chạy migration Khối B (`1784500000000` requires_manual_review, `1784500000001` distribution_review).
- Seed permission `release_review.approve/reject` + gán role reviewer của tenant.
- RESUBMIT endpoint (ACTION_REQUIRED→VALIDATING) — aggregate có `resubmit()` nhưng chưa có HTTP; làm
  cùng UI write-flow.

### FU-5 — Resilience Khối D chưa phủ hết (rà soát 2026-07-23)

Khối D todo ghi "bọc circuit breaker cho ci-import, ci-qa, ci-deliver-desire" + "gRPC timeout" nhưng
code chỉ áp một phần:
- `ci-qa.adapter.ts` + `ci-deliver-desire.adapter.ts`: **không có** `CircuitBreaker` (chỉ `ci-import.adapter.ts`
  có, threshold 5 / cooldown 30s). Hệ quả: CI QA/deliver-desire sập → runner throw liên tục cạn BullMQ
  attempts thay vì fail-fast qua breaker đã mở.
- `grpc-identifier.adapter.ts`: `getUpc()`/`create()` **không** bọc `withTimeout` → PROVISIONING_IDS có
  thể treo nếu gRPC không trả lời (chỉ dựa timeout tầng transport, chưa explicit).
Cơ học, không đụng domain. Nên áp cùng pattern `ci-import`/`sftp-uploader` đã có.

### FU-6 — Idempotency chưa bền + index thiếu (rà soát 2026-07-23)

- `ddex-xml-package-builder.adapter.ts` `deriveBatchId(key)` bỏ qua `key`, luôn `genBatchId()` mới →
  check `fs.existsSync(outputDir)` không bao giờ hit (dead code). Retry tạo folder mới, re-download media.
  Fix: derive batchId từ key (hash/prefix) để cùng key → cùng folder.
- `grpc-identifier.provisionUpc()` không truyền `releaseId`, không check "release này đã có UPC chưa" →
  redeliver sau crash có thể cấp nhiều UPC. Cần xác nhận contract `UpcService.getUpc()` (get-or-create?).
- Thiếu index `(channel_id, status)` trên `orchestration_ticket` (breakdown B1 yêu cầu 3, ORM chỉ có 2).
