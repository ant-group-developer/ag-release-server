# Phase 5 — Khép vòng lặp Worker + REVIEW gate + Resilience

**Priority:** Cao · **Status:** 🔄 In Progress (Khối A ✅ Done) · **Depends on:** Phase 2–4 ✅ · **Blocks:** UI write-flow, Phase 6

**Progress:** [✅] Khối A [ ] Khối B [ ] Khối C [ ] Khối D [ ] Khối E

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

**Status:** ✅ DONE (2026-07-21)
**Files:** 7 new, 3 modified, 646 LOC
**Tests:** 229 pass (E2E + unit)
**Code Review:** 4 enhancement notes (2 high, 2 medium) — see review output

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

- [ ] Inject TICKET_SERVICE vào 4 runner
- [ ] sftp-upload: fail → open(UPLOAD_FAIL) + ACTION_FAIL
- [ ] qa: flagged → open(QA_FLAG) + GATE_FAIL
- [ ] ci-import-check: problem → open(INGEST_FAIL) + WAIT_FAIL
- [ ] status-sync: rejected → open(PARTNER_FAIL) + WAIT_FAIL
- [ ] Unit test mỗi runner: happy + fail→ticket→command
- [ ] Integration test: channel → ISSUES → aggregate PARTIALLY_DISTRIBUTED

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

- [ ] Cột `requires_manual_review` + migration
- [ ] Bảng `review` + ORM entity + migration
- [ ] ReviewRepository port + adapter
- [ ] ValidateRunner đọc cờ tenant
- [ ] Endpoint approve/reject + RBAC
- [ ] DistributionCommandService.approveReview/rejectReview
- [ ] Wire module
- [ ] Integration test: submit (tenant review=on) → IN_REVIEW → approve → tiếp; → reject → ACTION_REQUIRED

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

- [ ] `queue-concurrency.config` (SFTP concurrency thấp + limiter tĩnh)
- [ ] Worker đọc config set concurrency/limiter
- [ ] `circuit-breaker` wrapper + bọc CI/SFTP adapter
- [ ] `with-timeout` + áp SFTP/gRPC/build
- [ ] Backoff mapping per queue trong adapter
- [ ] Worker bắt RetryLimitExceededError → không retry
- [ ] Test: SFTP timeout → retry → cạn → ISSUES; breaker mở khi lỗi liên tục

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

- [ ] Handler wrap RetryExecutionPolicy cho RESET_FOR_RETRY
- [ ] Endpoint POST /:id/retry admin-only + RBAC
- [ ] Bắt RetryLimitExceededError → HTTP 409
- [ ] Resolve ticket khi reset thành công
- [ ] Test: PARTIALLY_DISTRIBUTED → retry → DELIVERING (chỉ channel ISSUES); poison=3 → 409

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

- Reviewer role riêng hay chỉ ADMIN duyệt? (mặc định ADMIN, chốt với nghiệp vụ)
- Validation: danh sách trường bắt buộc chính xác của release? (cần rà `release.entity.ts` + track/cover/audio khi code ValidateRunner)
- Circuit breaker: tự viết hay dùng `opossum`? (đề xuất opossum — battle-tested)
- Export batch (`dist.export-batch`): admin trigger thủ công hay auto theo lịch? (đã treo từ Phase 4 Group E — chốt trước khi hoàn thiện runner export)
