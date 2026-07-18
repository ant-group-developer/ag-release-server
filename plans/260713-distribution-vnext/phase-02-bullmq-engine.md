# Phase 2 — BullMQ engine thay cron-poll + DB-queue tự viết

**Priority:** Cao · **Status:** 🔵 Step 1-6 XONG (outbox relay + 6 integration test) · **Depends on:** Phase 1 ✅ · **Blocks:** Phase 3

**Progress:** [x] Step 1 [x] Step 2 [x] Step 3 [x] Step 4 [x] Step 5 [x] Step 6 [ ] Step 7

## Context Links

- Kiến trúc: `docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md` §6 (engine sau port), §8 (queue topology + outbox), §10 (reliability), §11 (persistence)
- Sơ đồ vòng lặp: `docs/flow-release-submit-new/so-do-end-to-end-bullmq-xstate.md` §A (một vòng orchestrator), §B (một release chạy xuyên)
- **Hướng dẫn dễ hiểu (đọc trước khi code):** `phase-02-guide-de-hieu.md` — analogy + trace + skeleton từng file
- Domain nền: `src/modules/distribution-orchestration/domain/` (48 file, 117 test xanh)
- v3 đang thay: `src/modules/release/modules/release-executions3/` (DB-queue + cron poll)

## Overview

Thay cơ chế điều phối của v3 (DB-queue tự viết `release_execution*3` + `@nestjs/schedule` cron poll) bằng **BullMQ đặt sau `WorkflowEnginePort`**. Giữ nguyên nghiệp vụ — chỉ đổi cách *thực thi* + *chờ* + *retry*. Domain Phase 1 KHÔNG sửa; Phase 2 "cắm điện" domain vào hạ tầng.

Bài toán là **wait-bound** (chờ SFTP/CI/DSP 1–5 ngày), không throughput-bound. Hệ quả bất di: không giữ tài nguyên khi chờ (delayed job), state ở Postgres, worker stateless, mọi bước idempotent.

## Quyết định đã chốt

Quyết định gốc (đặc tả):

| # | Chủ đề | Chốt | Lý do |
|---|--------|------|-------|
| 1 | **XState** | **KHÔNG dùng (deferred).** Domain (aggregate `Distribution` + `channel-interpreter`) LÀ nguồn sự thật cho state transition. | Aggregate + interpreter đã là 2 state machine thuần. XState = nguồn sự thật thứ 2 + bị guard `no-framework-import` cấm + phá process-as-data. XState không lo "chờ/retry" (đó là BullMQ). Thêm rẻ, gỡ đắt → chưa có bằng chứng cần thì không cưới. |
| 2 | **BullMQ dep** | **Port + in-memory adapter TRƯỚC**, cài `bullmq` + `BullMqWorkflowAdapter` thật ở step cuối + integration test riêng. | Unit test không cần Redis; giữ vòng lặp học từng bước; vẫn đạt exit "end-to-end qua BullMQ". |
| 3 | **Outbox relay** | **Polling worker**: `SELECT ... WHERE dispatched_at IS NULL FOR UPDATE SKIP LOCKED` → enqueue → mark dispatched. | Đơn giản, dễ test, at-least-once, quen thuộc. Không cần pg_notify/CDC giai đoạn này (YAGNI). |
| 4 | **Ranh giới P2/P3** | **P2 = write-side** (4 bảng + ghi `distribution_event` trong transaction + relay enqueue). **P3 = read-side** (projection `release_dsp_delivery` + SSE timeline). | CQRS-lite: tách ghi khỏi đọc. P2 *ghi* event nhưng chưa *chiếu* ra UI. |

Quyết định phát sinh khi code (Step 1–2):

| # | Chủ đề | Chốt | Ghi chú |
|---|--------|------|---------|
| 5 | **DI token** | Cách A — Symbol token, không abstract class. Port là interface thuần TS. | Nhất quán 3 Symbol: `WORKFLOW_ENGINE` / `UNIT_OF_WORK` / `DISTRIBUTION_REPOSITORY`. |
| 6 | **TxContext shape** | Expose `EntityManager` (Lựa chọn 1). | Chấp nhận coupling TypeORM ở application layer — team đã bake TypeORM, không có kịch bản đổi ORM; port `TxContext.query()` thêm phức tạp không đáng. |
| 7 | **Optimistic lock** | KHÔNG dùng `@VersionColumn` — repo tự UPDATE ... WHERE version=? SET version=version+1, đọc `rowsAffected`. | `version=0` → INSERT (fresh aggregate), sau commit lần đầu DB=1. |
| 8 | **ORM entity naming** | Suffix `.orm-entity.ts` thay `.entity.ts` — tránh nhiễu domain `.entity.ts`. | Cập nhật glob autoload `database.config.ts` thêm `*.orm-entity{.ts,.js}`. |
| 9 | **Relations mapping** | KHÔNG map `@ManyToOne`/`@OneToMany` — giữ FK cột string, repo dùng 2 query song song rõ ràng. | Cost tương đương JOIN với N nhỏ, kiểm soát query rõ hơn. |
| 10 | **jsonb payload type** | `payload: object` (không `Record<string, unknown>`). | TypeORM DeepPartial khắt khe với `Record<string, unknown>` khi dùng `repo.save()`. Repo dùng `createQueryBuilder().insert()` để tránh vấn đề này. |
| 11 | **Bigserial id** | Trả `string` (không `number`). | `bigint > MAX_SAFE_INTEGER` — không ép về number. |
| 12 | **UoW nested tx** | KHÔNG hỗ trợ (nested `run()` mở 2 QueryRunner độc lập). | KISS ở P2; thêm savepoint khi có use case thật. |
| 13 | **Aggregate `type` field** | Public readonly field trong constructor (nhất quán id/releaseId/…), không private+getter. | Fix tech debt Nhịp 2.5: trước đó `props.type` bị quăng đi, repo phải cast `as unknown`. |
| 14 | **Migration in integration test** | `synchronize: true` thay `runMigrations()`. | TypeORM chạy TOÀN BỘ migration repo, không filter được — có migration cũ phụ thuộc bảng `tracks` module khác. Scope test = repo behavior, không phải migration correctness. Trade-off: partial index outbox + FK CASCADE không có trong test này. |
| 15 | **Integration DB source** | `testcontainers` + `@testcontainers/postgresql` (Postgres 16-alpine, 1 container/suite). | Zero user setup, CI-ready. `beforeEach` TRUNCATE CASCADE giữa test. |

**Đường lùi XState (nếu Phase 5+ chứng minh cần):** giữ 3 bề mặt domain `apply()` / `pullDomainEvents()` / `rehydrate()` bất biến + persist state ở dạng trung tính (`state` string + `pos` số + `retryCount`). Khi cần, thêm `StateMachinePort` riêng (KHÁC `WorkflowEnginePort` — hai trục: quyết-state vs thực-thi-bước); XState vào application như view/simulator đọc cùng `DeliveryProcess`, không thành nguồn sự thật thứ 2.

## Architecture

### Cấu trúc thư mục (framework NGOÀI `domain/`)

```
distribution-orchestration/
├── domain/                                  # Phase 1 — BẤT KHẢ XÂM PHẠM
├── application/
│   ├── errors/optimistic-lock.error.ts       [Step 2 ✅]
│   ├── ports/
│   │   ├── workflow-engine.port.ts           [Step 1 ✅] QueueName union, EnqueueOptions, JobPayload, WORKFLOW_ENGINE
│   │   ├── unit-of-work.port.ts              [Step 1 ✅] TxContext{manager: EntityManager}, UNIT_OF_WORK
│   │   ├── outbox-entry.ts                   [Step 2 ✅] {queue, payload, jobId, delayMs?, runAt?}
│   │   └── distribution-repository.port.ts   [Step 2 ✅] load + saveWithOutbox, DISTRIBUTION_REPOSITORY
│   ├── commands/*.ts                          [Step 5] SubmitCmd, MarkValidatedCmd, ChannelInputCmd...
│   ├── orchestrate.handler.ts                [Step 5] "một vòng": load→apply→pull→persist+outbox
│   └── step-runners/*.ts                      [Step 6] provision/build/upload/... → phát STEP_DONE
├── infrastructure/
│   ├── persistence/
│   │   ├── distribution.orm-entity.ts        [Step 2 ✅] + 3 index
│   │   ├── channel-delivery.orm-entity.ts    [Step 2 ✅] PK varchar(80) + 2 index
│   │   ├── distribution-event.orm-entity.ts  [Step 2 ✅] bigserial id, 3 cột chiếu, jsonb payload
│   │   ├── outbox-event.orm-entity.ts        [Step 2 ✅] UNIQUE(jobId), jsonb payload
│   │   ├── distribution.repository.ts        [Step 2 ✅] TypeOrmDistributionRepository (load + saveWithOutbox)
│   │   ├── typeorm-unit-of-work.adapter.ts   [Step 2 ✅] QueryRunner + transaction
│   │   └── __tests__/*.integration.spec.ts   [Step 2 ✅] testcontainers Postgres, 3 case
│   ├── workflow/
│   │   ├── in-memory-workflow.adapter.ts     [Step 1 ✅] Map + clockMs ảo + advanceTime + FIFO dedupe
│   │   └── bullmq-workflow.adapter.ts        [Step 8]
│   ├── relay/outbox-relay.ts                  [Step 7] polling worker → enqueue
│   ├── relay/
│   │   ├── outbox-relay.ts                   [Step 6 ✅] polling + dispatch + retry + soft-DLQ
│   │   └── __tests__/*.integration.spec.ts   [Step 6 ✅] testcontainers, 6 case
│   └── test-doubles/*.ts                      [Step 3 ✅] 9 fake port in-memory (idempotent theo key/id)
└── distribution-orchestration.module.ts       [Step 1+2 ✅] wire 3 provider
```

Migration: `src/migrations/1784200000000-CreateDistributionOrchestrationTables.ts` [Step 2 ✅] — 4 CREATE TABLE + 3 FK CASCADE + 8 INDEX + 1 partial index outbox (WHERE dispatched_at IS NULL). CHƯA chạy `migration:run` production; integration test dùng `synchronize` (xem quyết định #14).

**Nguyên tắc:** `application/` + `infrastructure/` được import framework (bullmq/typeorm/@nestjs). `domain/` giữ nguyên. Guard `no-framework-import.spec.ts` chỉ quét `domain/` → vẫn xanh.

### Vòng lặp orchestrator (một vòng = một transition)

```
dist.orchestrate job {distributionId, command, idempotencyKey}
  (1) load Distribution + channels từ Postgres (rehydrate)
  (2) apply(command, clock)              ← domain quyết state', KHÔNG side-effect
  (3) pullDomainEvents()                 ← lấy event tích luỹ
  (4) TRANSACTION atomic:
        UPDATE distribution.state (+ version optimistic lock)
        UPSERT channel_delivery rows
        INSERT distribution_event (mỗi domain event)
        INSERT outbox_event       (mỗi action cần enqueue)
      COMMIT
  (5) outbox-relay (polling) đọc outbox chưa dispatch → enqueue queue chuyên biệt
  (6) worker chuyên biệt LÀM side-effect (gọi port) →
        OK   → enqueue dist.orchestrate {STEP_DONE}
        chờ  → enqueue {delayMs}/scheduledAt (nhả worker ngay)
        lỗi  → retry/backoff → hết attempts → DLQ + {STEP_FAILED}
```

### Queue topology (§8 — mỗi loại việc một queue)

| Queue | Job payload | Concurrency | Ghi chú |
|-------|-------------|-------------|---------|
| `dist.orchestrate` | `{distributionId, command, key}` | vừa | trạm trung chuyển DUY NHẤT quyết bước kế |
| `dist.provision-id` | `{distributionId, key}` | thấp | gRPC UPC/ISRC |
| `dist.build-package` | `{distributionId, key}` | vừa | DDEX XML + folder → GCS/S3 (CPU+disk) |
| `dist.sftp-upload` | `{distributionId, channelId, host, key}` | **rate-limit per host** | nút cổ chai — bulkhead |
| `dist.ci-import-check` | `{distributionId, channelId, batchId, key}` | thấp | delayed re-poll 5m |
| `dist.ci-qa-check` | `{distributionId, channelId, key}` | thấp | GATE |
| `dist.export-batch` | `{distributionId, channelId, method, key}` | 1 | gom batch theo lịch |
| `dist.status-sync` | `{distributionId, channelId, batchId, key}` | thấp | reconcile nền |
| `dist.dlq.*` | — | — | quá max-retry → soi thủ công |

### WorkflowEnginePort (chữ ký dự kiến)

```ts
type QueueName = 'dist.orchestrate' | 'dist.provision-id' | ...;
interface EnqueueOpts { delayMs?: number; jobId?: string; attempts?: number; backoffMs?: number; }
interface WorkflowEnginePort {
  enqueue(queue: QueueName, job: JobPayload, opts?: EnqueueOpts): Promise<void>;
  schedule(queue: QueueName, job: JobPayload, at: Date): Promise<void>; // WAIT = delayed job
}
```
- "Chờ" = `delayMs`/`schedule(at)` → KHÔNG sleep/block worker.
- `jobId = idempotencyKey` → BullMQ tự dedupe job trùng.
- In-memory adapter: Map + setTimeout (test); BullMQ adapter: `new Queue()` per queue name.

## Persistence (schema dự kiến — khớp `*Row` của domain)

```sql
distribution (
  id uuid PK, release_id uuid, snapshot_id uuid, tenant_id varchar,
  type varchar,           -- INITIAL_RELEASE/UPDATE/TAKEDOWN/RETRY
  correlation_id varchar,
  state varchar,          -- DistributionState
  upc varchar NULL, package_uri varchar NULL,
  retry_count int DEFAULT 0,
  version int DEFAULT 0,  -- optimistic lock (chống 2 worker cùng apply)
  created_at, updated_at
)
channel_delivery (
  id varchar PK,          -- '{distId}:ch:{i}'
  distribution_id uuid FK,
  dsp_code varchar, topology varchar, process_code varchar,
  pos int, state varchar, -- ChannelState
  retry_count int DEFAULT 0,
  ticket_ref varchar NULL,
  scheduled_at timestamptz NULL,  -- WAIT stage hẹn giờ resume
  metadata jsonb,
  UNIQUE(distribution_id, id)
)
distribution_event (           -- append-only, xương sống timeline/audit (P3 chiếu ra)
  id uuid PK, distribution_id uuid, channel_id varchar NULL,
  type varchar, level varchar, -- milestone/progress
  payload jsonb, occurred_at timestamptz
)
outbox_event (                 -- reliable publish (polling relay)
  id uuid PK, aggregate_id uuid, type varchar,
  queue varchar, payload jsonb,
  created_at timestamptz, dispatched_at timestamptz NULL
)
```
- Snapshot release: KIỂM TRA bảng snapshot v3 có sẵn chưa; nếu chưa → thêm `release_snapshot(id, release_id, payload jsonb, created_at)`.
- Migration theo convention repo: raw SQL, prefix timestamp, snake_case, index + FK tường minh.

## Implementation Steps

1. **Nền + port ✅** `WorkflowEnginePort` + `UnitOfWorkPort` + `InMemoryWorkflowAdapter` (Map + clockMs ảo + advanceTime + setTime + jobId dedupe + FIFO seq). Module scaffold wire `WORKFLOW_ENGINE`. 5 spec test in-memory.
2. **Persistence ✅** — chia làm 6 nhịp:
   - 2.1 Schema 4 bảng (chốt: `version` cột optlock; `distribution_event` 3 cột chiếu + jsonb payload; hoãn `orchestration_ticket` giữ cột string).
   - 2.2 Migration hand-written `1784200000000-CreateDistributionOrchestrationTables.ts` (4 CREATE + 3 FK + 8 INDEX + 1 partial index outbox).
   - 2.3 4 ORM entity (suffix `.orm-entity.ts`; glob autoload update).
   - 2.4 `TypeOrmDistributionRepository` (load 2 query song song + saveWithOutbox: INSERT/UPDATE optlock + UPSERT channels + INSERT events + INSERT outbox trong tx do UoW mở).
   - 2.5 `TypeOrmUnitOfWork` (QueryRunner.connect → startTransaction → callback → commit/rollback → release trong finally; guard `isTransactionActive` tránh double-rollback). Wire `UNIT_OF_WORK` + `DISTRIBUTION_REPOSITORY`.
   - 2.6 Integration test với `testcontainers` + Postgres 16-alpine — 3 case: round-trip persist 4 bảng, load rehydrate, optimistic lock conflict.
3. **9 test-double port in-memory ✅** (`FixedClock`, `InMemoryIdentifierProvisioner`, `InMemoryPackageBuilder`, `InMemoryPackageUploader`, `InMemoryQaChecker`, `InMemoryExporter`, `InMemoryIngestResultReader`, `InMemoryDeliveryStatusReader`, `InMemoryTicketService`). Mỗi double tôn trọng idempotency contract ghi trong docblock port (gọi lại cùng key/releaseId/trackId → trả kết quả cũ, không tạo mới). `InMemoryPackageUploader` có `failNextUpload()` cho test retry.
4. **Orchestrate handler + 1 command** (submit → markValidated) chạy end-to-end in-memory: assert state + event + outbox.
5. **Step-runners** lần lượt: provision → build → upload → import-check → qa → export → status-sync. Mỗi runner gọi port → phát STEP_DONE/STEP_FAILED về `dist.orchestrate`.
6. **Outbox relay** (polling worker) + retry/backoff + DLQ mỗi queue.
7. **BullMqWorkflowAdapter thật** + wire Redis (`@nestjs-modules/ioredis` đã có) + integration test 1 release INITIAL end-to-end.

_(Step Repository của đặc tả gốc gộp vào Step 2 Nhịp 2.4; đánh lại số Step 3→7 cho khớp.)_

## Todo

- [x] Step 1: WorkflowEnginePort + UnitOfWorkPort + InMemoryWorkflowAdapter + module scaffold
- [x] Step 2: 4 ORM entity + migration + repo + UoW + integration test (Nhịp 2.1–2.6)
- [x] Step 3: 9 test-double in-memory
- [x] Step 4: orchestrate.handler + submit→validate chạy in-memory + test (6 spec xanh)
- [x] Step 5a: 10 command discriminated union + handler dispatch + buildOutbox mở rộng (5 pipeline spec xanh — total 136 test)
- [x] Step 5b: migration channel_specs jsonb + rehydrate accept specs + per-channel outbox từ DELIVERING + 7 step-runners + E2E SUBMIT→LIVE spec (134 unit + 3 integration xanh)
- [x] Step 6: outbox-relay polling + retry/backoff + soft-DLQ (6 integration test xanh, total 143 test)
- [ ] Step 7: cài bullmq + BullMqWorkflowAdapter + integration test end-to-end
- [ ] Cập nhật plan.md status Phase 2

## Success Criteria

- Unit test: submit→validate→provision→build→deliver (1 channel) chạy qua handler + in-memory adapter, state chảy đúng, events + outbox ghi đúng, KHÔNG cần Redis/DB thật.
- Idempotency: chạy lại cùng command/job (cùng key) KHÔNG tạo side-effect/event kép.
- Guard `no-framework-import.spec.ts` vẫn xanh (domain sạch).
- Integration (Step 7): 1 release INITIAL chạy end-to-end qua BullMQ thật với port giả cho external.
- Mỗi file < 200 LOC.

**Status hiện tại (Step 1–6):** 143 test xanh (134 unit + 9 integration Postgres real via testcontainers). Step 6 thêm 6 integration test cho OutboxRelay. `no-framework-import.spec.ts` xanh. tsc sạch cho module.

**Step 6 delivered files:**
- `infrastructure/relay/outbox-relay.ts` — `@Cron('*/5 * * * * *')` polling worker: SELECT FOR UPDATE SKIP LOCKED → dispatch via WorkflowEnginePort → mark dispatched. Retry with `attempts` counter + `last_error`. Soft-DLQ at MAX_ATTEMPTS=10. Concurrency guard (`_polling` flag).
- `infrastructure/relay/__tests__/outbox-relay.integration.spec.ts` — 6 case: happy path 3 entries, schedule(runAt) mode, engine failure retry, max attempts skip, SKIP LOCKED concurrent polls, idempotent re-poll.
- `distribution-orchestration.module.ts` — wire `OutboxRelay` as provider.

**Quyết định Step 6 (khi code):**

| # | Chủ đề | Chốt | Ghi chú |
|---|--------|------|---------|
| 23 | Port cho relay | KHÔNG tạo port riêng. Relay là pure infra — application layer không bao giờ gọi relay trực tiếp. | KISS — port sẽ thừa, relay chỉ có 1 implementation (polling DB). |
| 24 | maxAttempts | Hardcode `const MAX_ATTEMPTS = 10` trong file relay. | Chưa có use case đổi runtime. Refactor khi cần. |
| 25 | Test strategy | Integration test only (testcontainers Postgres). Bỏ unit test mocked. | Relay phụ thuộc nặng raw SQL (`FOR UPDATE SKIP LOCKED`) — mock QueryRunner test ít hành vi thật. |
| 26 | Tx scope relay | 1 QueryRunner tx bao toàn batch: SELECT FOR UPDATE → dispatch 1-by-1 → UPDATE status. | SKIP LOCKED lock batch, dispatch nhanh (chỉ ghi queue). Fail 1 entry không chặn cả batch. |
| 27 | Relay tách khỏi UoW | Relay tự tạo QueryRunner riêng, KHÔNG dùng UoW port. | UoW là cho handler (business tx). Relay là infra polling — concerns khác nhau. |
| 28 | Concurrency guard | `private _polling = false` — Cron tick skip nếu poll trước chưa xong. | Tránh 2 poll chồng nhau khi 1 batch chậm > 5s. |

**Step 4 delivered files:**
- `application/commands/distribution.command.ts` — discriminated union `SUBMIT | MARK_VALIDATED` (Step 5+ mở rộng 8 command còn lại)
- `application/errors/aggregate-not-found.error.ts` — non-SUBMIT vào load null
- `application/policy-resolver.ts` — ánh xạ `ExecutionType` → `ExecutionPolicy` + `POLICY_RESOLVER` token (RETRY tạm wrap INITIAL)
- `application/ports/clock.port.token.ts` — Symbol `CLOCK` (giữ domain sạch framework)
- `application/orchestrate.handler.ts` — vòng lặp 1 turn: load → apply → pullDomainEvents → buildOutbox → saveWithOutbox
- `infrastructure/clock/system-clock.adapter.ts` — `SystemClock` cho prod
- `infrastructure/test-doubles/in-memory-unit-of-work.ts` — no-tx uow cho handler test
- `infrastructure/test-doubles/in-memory-distribution-repository.ts` — repo test-double mô phỏng optlock
- `distribution-orchestration.module.ts` — wire `POLICY_RESOLVER` + `CLOCK` + `OrchestrateHandler`

**Quyết định Step 4 (khi code):**

| # | Chủ đề | Chốt | Ghi chú |
|---|--------|------|---------|
| 16 | Command shape | Discriminated union theo `type` (không class per command). Handler `switch` trên `command.type`. | KISS — 2 command giờ, 10 command Step 5+ vẫn scale được. |
| 17 | Command "SUBMIT" tạo aggregate | `SubmitCommand` mang `create: CreateDistributionProps`. Handler: `load null → Distribution.create(cmd.create)`; `load có → dùng aggregate cũ (idempotent guard bên trong)`. | Không cần command riêng "CREATE". Aggregate `submit()` đã idempotent (state===VALIDATING → return). |
| 18 | PolicyResolver riêng port | Aggregate KHÔNG lưu policy — handler resolve theo `dist.type` ngay trước khi apply. RETRY tạm wrap INITIAL (đọc `wrappedType` từ DB Step 5+). | Giữ process-as-data invariant + tránh serialize policy vào DB. |
| 19 | CLOCK token ở application/ | `CLOCK = Symbol('Clock')` đặt `application/ports/clock.port.token.ts` — KHÔNG đặt trong `domain/ports/clock.port.ts`. | Guard `no-framework-import` chặn Symbol/NestJS ở domain. Token là hạ tầng DI, không phải business. |
| 20 | Outbox derivation từ state MỚI | `buildOutbox(dist, command)` switch trên `dist.state` sau `apply()`. `PROVISIONING_IDS → dist.provision-id`; `BUILDING_PACKAGE → dist.build-package`. Terminal + VALIDATING = 0 outbox. | State là "sự thật kế tiếp cần làm gì". jobId = `${distId}:${state}:${key}` — deterministic. |
| 21 | Handler KHÔNG gọi WorkflowEnginePort | Chỉ ghi outbox. Relay (Step 6) đọc outbox → enqueue thật. | At-least-once + không cần 2-phase commit DB+Redis. |
| 22 | InMemoryDistributionRepository rehydrate on load | `load()` gọi `Distribution.rehydrate(snapshot, [...channels])` — 2 load ra 2 instance độc lập, giả contract repo thật. | Cần cho test optlock race (turn A + B mutate độc lập). |

## Risk Assessment

- **Optimistic lock đua:** 2 worker cùng apply 1 distribution → dùng cột `version`, apply lỗi version → retry vòng orchestrate.
- **Outbox at-least-once:** relay có thể enqueue trùng khi crash giữa enqueue và mark dispatched → job phải idempotent (jobId=key) + side-effect check "đã làm chưa".
- **Wait không được block:** review mọi step-runner đảm bảo "chờ" = delayed job, không `await sleep`.
- **v3 song song:** Phase 2 KHÔNG đụng luồng v3 đang chạy; cắt-over để phần migration riêng (xen P2–P3).

## Security Considerations

- Credential SFTP/CI/email → secret manager, không log giá trị (đẩy sang Phase 4 adapter thật).
- `correlationId` xuyên job data cho trace, không nhét PII vào job payload.
- Idempotency key chống replay ở API submit.

## Next Steps

- Sau Phase 2: Phase 3 (đọc `distribution_event` → projection + SSE timeline).
- Phase 4 (ACL adapter thật cho 9 port) có thể chạy song song.

## Unresolved Questions

- Bảng `release_snapshot` đã tồn tại từ v3 chưa, hay Phase 2 tạo mới? (chưa chạm — schema Step 2 chỉ lưu `snapshotId` uuid; kiểm tra khi cần load snapshot ở step-runner)
- ~~`WorkflowEnginePort` + command types đặt ở `application/` hay `domain/`~~ → **Chốt: `application/`** (Step 1).
- Rate-limit per host cho SFTP: cấu hình tĩnh hay đọc từ config DSP/aggregator? (quyết khi vào Step 5/7)
- Migration test coverage: hiện integration dùng `synchronize`. Nếu cần verify migration file (partial index + FK CASCADE) → cần custom runner filter migration theo module, hoặc test riêng ở CI full-pipeline. Ghi tech debt, chưa scope.
- Nested transaction (savepoint): UoW hiện KHÔNG hỗ trợ. Nếu Step 4/5 có handler compose 2 uow.run() lồng nhau → cần thêm savepoint logic.
- **Rehydrate mất `_channelSpecs`** (phát hiện Step 5a): `Distribution.rehydrate(row, channels)` không nhận specs → sau save+load, `ensureChannelsSpawned` no-op cho aggregate CHƯA vào DELIVERING. Case: save ở PROVISIONING_IDS → load → MARK_PACKAGE_BUILT spawn channels → 0 channel spawned. Fix Step 5b: thêm cột `distribution.channel_specs jsonb` + tham số `specs: ChannelDeliverySpec[]` cho rehydrate + repo serialize/deserialize. Ảnh hưởng migration + orm-entity + repo.load + integration test.

