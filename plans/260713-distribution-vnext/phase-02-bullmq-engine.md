# Phase 2 — BullMQ engine thay cron-poll + DB-queue tự viết

**Priority:** Cao · **Status:** 🟡 Đặc tả xong — sẵn sàng EXECUTE
**Depends on:** Phase 1 (domain thuần) ✅ · **Blocks:** Phase 3 (outbox projection + SSE)

## Context Links

- Kiến trúc: `docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md` §6 (engine sau port), §8 (queue topology + outbox), §10 (reliability), §11 (persistence)
- Sơ đồ vòng lặp: `docs/flow-release-submit-new/so-do-end-to-end-bullmq-xstate.md` §A (một vòng orchestrator), §B (một release chạy xuyên)
- **Hướng dẫn dễ hiểu (đọc trước khi code):** `phase-02-guide-de-hieu.md` — analogy + trace + skeleton từng file
- Domain nền: `src/modules/distribution-orchestration/domain/` (48 file, 117 test xanh)
- v3 đang thay: `src/modules/release/modules/release-executions3/` (DB-queue + cron poll)

## Overview

Thay cơ chế điều phối của v3 (DB-queue tự viết `release_execution*3` + `@nestjs/schedule` cron poll) bằng **BullMQ đặt sau `WorkflowEnginePort`**. Giữ nguyên nghiệp vụ — chỉ đổi cách *thực thi* + *chờ* + *retry*. Domain Phase 1 KHÔNG sửa; Phase 2 "cắm điện" domain vào hạ tầng.

Bài toán là **wait-bound** (chờ SFTP/CI/DSP 1–5 ngày), không throughput-bound. Hệ quả bất di: không giữ tài nguyên khi chờ (delayed job), state ở Postgres, worker stateless, mọi bước idempotent.

## Quyết định đã chốt (2026-07-16)

| # | Chủ đề | Chốt | Lý do |
|---|--------|------|-------|
| 1 | **XState** | **KHÔNG dùng (deferred).** Domain (aggregate `Distribution` + `channel-interpreter`) LÀ nguồn sự thật cho state transition. | Aggregate + interpreter đã là 2 state machine thuần. XState = nguồn sự thật thứ 2 + bị guard `no-framework-import` cấm + phá process-as-data. XState không lo "chờ/retry" (đó là BullMQ). Thêm rẻ, gỡ đắt → chưa có bằng chứng cần thì không cưới. |
| 2 | **BullMQ dep** | **Port + in-memory adapter TRƯỚC**, cài `bullmq` + `BullMqWorkflowAdapter` thật ở step cuối + integration test riêng. | Unit test không cần Redis; giữ vòng lặp học từng bước; vẫn đạt exit "end-to-end qua BullMQ". |
| 3 | **Outbox relay** | **Polling worker**: `SELECT ... WHERE dispatched_at IS NULL FOR UPDATE SKIP LOCKED` → enqueue → mark dispatched. | Đơn giản, dễ test, at-least-once, quen thuộc. Không cần pg_notify/CDC giai đoạn này (YAGNI). |
| 4 | **Ranh giới P2/P3** | **P2 = write-side** (4 bảng + ghi `distribution_event` trong transaction + relay enqueue). **P3 = read-side** (projection `release_dsp_delivery` + SSE timeline). | CQRS-lite: tách ghi khỏi đọc. P2 *ghi* event nhưng chưa *chiếu* ra UI. |

**Đường lùi XState (nếu Phase 5+ chứng minh cần):** giữ 3 bề mặt domain `apply()` / `pullDomainEvents()` / `rehydrate()` bất biến + persist state ở dạng trung tính (`state` string + `pos` số + `retryCount`). Khi cần, thêm `StateMachinePort` riêng (KHÁC `WorkflowEnginePort` — hai trục: quyết-state vs thực-thi-bước); XState vào application như view/simulator đọc cùng `DeliveryProcess`, không thành nguồn sự thật thứ 2.

## Architecture

### Cấu trúc thư mục (framework NGOÀI `domain/`)

```
distribution-orchestration/
├── domain/                                  # Phase 1 — BẤT KHẢ XÂM PHẠM
├── application/
│   ├── ports/workflow-engine.port.ts        # interface enqueue/schedule (thuần)
│   ├── ports/unit-of-work.port.ts           # interface transaction boundary
│   ├── commands/*.ts                         # SubmitCmd, MarkValidatedCmd, ChannelInputCmd...
│   ├── orchestrate.handler.ts               # "một vòng": load→apply→pull→persist+outbox
│   └── step-runners/*.ts                     # provision/build/upload/... gọi port → phát STEP_DONE
├── infrastructure/
│   ├── persistence/
│   │   ├── *.orm-entity.ts                    # 4 TypeORM entity (distribution/channel/event/outbox)
│   │   ├── distribution.repository.ts        # rehydrate + save-with-outbox (1 transaction)
│   │   └── outbox.repository.ts
│   ├── workflow/in-memory-workflow.adapter.ts   # cho unit test (step 1)
│   ├── workflow/bullmq-workflow.adapter.ts      # thật (step cuối)
│   ├── relay/outbox-relay.ts                  # polling worker → enqueue
│   └── test-doubles/*.ts                      # 9 fake port in-memory
└── distribution-orchestration.module.ts
```

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

1. **Nền + port.** `WorkflowEnginePort` + `UnitOfWorkPort` + `InMemoryWorkflowAdapter`. Module scaffold. (chưa cài bullmq)
2. **TypeORM entity + migration** 4 bảng (+ snapshot nếu thiếu). Compile + migration:run dry.
3. **Repository** `rehydrate` (row → `Distribution.rehydrate`/`ChannelDelivery.rehydrate`) + `saveWithOutbox` (1 transaction: state + channels + events + outbox).
4. **9 test-double port in-memory** (Clock cố định, provisioner trả UPC giả, uploader ok, ...).
5. **Orchestrate handler + 1 command** (submit → markValidated) chạy end-to-end in-memory: assert state + event + outbox.
6. **Step-runners** lần lượt: provision → build → upload → import-check → qa → export → status-sync. Mỗi runner gọi port → phát STEP_DONE/STEP_FAILED về `dist.orchestrate`.
7. **Outbox relay** (polling worker) + retry/backoff + DLQ mỗi queue.
8. **BullMqWorkflowAdapter thật** + wire Redis (`@nestjs-modules/ioredis` đã có) + integration test 1 release INITIAL end-to-end.

## Todo

- [ ] Step 1: WorkflowEnginePort + UnitOfWorkPort + InMemoryWorkflowAdapter + module scaffold
- [ ] Step 2: 4 TypeORM entity + migration (+ snapshot check)
- [ ] Step 3: distribution.repository (rehydrate + saveWithOutbox transaction)
- [ ] Step 4: 9 test-double in-memory
- [ ] Step 5: orchestrate.handler + submit→validate chạy in-memory + test
- [ ] Step 6: step-runners (provision/build/upload/import/qa/export/status-sync)
- [ ] Step 7: outbox-relay polling + retry/backoff + DLQ
- [ ] Step 8: cài bullmq + BullMqWorkflowAdapter + integration test end-to-end
- [ ] Cập nhật plan.md status Phase 2

## Success Criteria

- Unit test: submit→validate→provision→build→deliver (1 channel) chạy qua handler + in-memory adapter, state chảy đúng, events + outbox ghi đúng, KHÔNG cần Redis/DB thật.
- Idempotency: chạy lại cùng command/job (cùng key) KHÔNG tạo side-effect/event kép.
- Guard `no-framework-import.spec.ts` vẫn xanh (domain sạch).
- Integration (step 8): 1 release INITIAL chạy end-to-end qua BullMQ thật với port giả cho external.
- Mỗi file < 200 LOC.

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

- Bảng `release_snapshot` đã tồn tại từ v3 chưa, hay Phase 2 tạo mới? (kiểm tra khi vào Step 2)
- `WorkflowEnginePort` + command types đặt ở `application/` hay một phần (types thuần) xuống `domain/`? (nghiêng application — engine là chi tiết ngoài domain)
- Rate-limit per host cho SFTP: cấu hình tĩnh hay đọc từ config DSP/aggregator? (quyết khi vào Step 6/8)

