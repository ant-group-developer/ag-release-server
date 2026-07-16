# Phase 2 — Hướng dẫn code dễ hiểu (companion của phase-02-bullmq-engine.md)

> Mục tiêu: đọc xong file này là bạn HIỂU đủ để tự gõ, không chỉ chép. Spec kỹ thuật ở
> `phase-02-bullmq-engine.md`. File này giải thích *vì sao* + *nghĩ thế nào*.

---

## 0. Mô hình tư duy: Domain là BỘ NÃO, Phase 2 là CƠ THỂ

Phase 1 tạo ra một bộ não hoàn chỉnh: nó **biết mọi luật** (submit rồi mới validate, QA fail thì ISSUES, retry không đụng LIVE...). Nhưng bộ não này chưa nối với thế giới bên ngoài:

- Chưa đọc/ghi được database — không nhớ được gì sau khi restart.
- Chưa gọi được SFTP/gRPC/CI — không thực thi được việc thật.
- Chưa tự chạy — không có cơ chế nào thúc nó tiến sang bước kế.

Phase 2 lắp 4 bộ phận quanh bộ não đó:

| Bộ phận | Thành phần | Vai trò |
|---------|-----------|---------|
| 🧠 Bộ não | domain (Phase 1) | Biết luật, quyết state kế. KHÔNG tự thực thi. |
| 💾 Trí nhớ | Repository + Postgres | Lưu / rehydrate state. Restart vẫn nhớ. |
| ✋ Tay | Step-runners + Ports | Gọi SFTP/gRPC/CI thật. |
| 💓 Nhịp | BullMQ queue | enqueue, delay, retry. |
| 📒 Sổ | Outbox + distribution_event | Không mất event, lưu lịch sử. |

**Nguyên tắc cốt lõi:** *Domain quyết, hạ tầng thực thi. Domain không bao giờ tự gọi SFTP; hạ tầng không bao giờ tự quyết luật.*

Đây là lý do domain có `apply()` (nhận command → đổi state → tích luỹ event) và `pullDomainEvents()` (trả ra danh sách event vừa tích luỹ). Domain **nói cho hạ tầng biết phải làm gì tiếp**, chứ không tự làm.

---

## 1. Vòng lặp Orchestrate — trái tim của cả hệ

Hình dung một **game turn-based**. Mỗi turn xử lý đúng một event cho một distribution rồi kết thúc. Không turn nào kéo dài — không ai ngồi chờ SFTP bên trong một turn.

Một turn = một job trong queue `dist.orchestrate`, gồm 6 bước:

```
JOB: { distributionId: "abc", command: "STEP_DONE:upload", key: "..." }

1 — LOAD:      đọc Postgres → rehydrate object Distribution
2 — APPLY:     distribution.apply(command, clock)   ← chỉ đổi state trong RAM
3 — PULL:      events = distribution.pullDomainEvents()
4 — PERSIST:   [TRANSACTION] lưu state + channels + events + outbox  ← atomic
5 — RELAY:     (tiến trình riêng) đọc outbox → enqueue vào queue chuyên biệt
6 — WORK:      worker chuyên biệt thực thi việc thật → xong thì enqueue lại 1 job
               dist.orchestrate → quay lại bước 1 cho turn kế
```

**Vì sao tách bước 2 (quyết) khỏi bước 5-6 (thực thi)?**
Vì "quyết" là tức thì (đổi biến trong RAM), còn "thực thi" có thể mất 5 phút (upload) hoặc 5 ngày (chờ DSP). Nếu gộp, worker bị giữ suốt thời gian chờ → phạm nguyên tắc wait-bound. Tách ra: quyết xong ghi DB rồi nhả worker; việc thật để một job khác làm.

### Trace thật — một release Spotify đi từ đầu

Process `spotify.initial` có 2 stage: `deliver`(ACTION) → `partner`(WAIT).

```
Turn 1: command=submit
  domain: DRAFT → VALIDATING, event=DistributionSubmitted
  persist, outbox có 1 job "đi validate"
Turn 2: command=markValidated (không review)
  domain: VALIDATING → PROVISIONING_IDS (INITIAL cần cấp id)
  outbox → job vào dist.provision-id
  [worker provision gọi gRPC lấy UPC → xong → enqueue command=idsProvisioned]
Turn 3: command=idsProvisioned(upc)
  domain: PROVISIONING_IDS → BUILDING_PACKAGE
  outbox → job vào dist.build-package
  [worker build DDEX XML → xong → enqueue command=packageBuilt]
Turn 4: command=packageBuilt(uri)
  domain: BUILDING_PACKAGE → DELIVERING, spawn channel "abc:ch:0" (Spotify)
  channel ở pos=0 (deliver, ACTION) → state DELIVERING
  outbox → job vào dist.sftp-upload
  [worker upload SFTP → xong → enqueue command=channelInput STEP_DONE cho ch:0]
Turn 5: command=applyChannelInput(ch:0, STEP_DONE)
  interpreter: pos 0→1, landing 'partner'(WAIT) → state WAITING, event=Waiting
  channel giờ WAITING → set scheduled_at
  outbox → job vào dist.status-sync với delay (vd 1 ngày)
  [không giữ worker — job ngủ trong Redis 1 ngày]
... 1 ngày sau ...
Turn 6: command=applyChannelInput(ch:0, ARRIVED)  (DSP đã duyệt)
  interpreter: pos 1→2 (hết stage) → terminalState LIVE, event=ChannelLive
  aggregate bubble-up: mọi channel LIVE → DISTRIBUTED, event=Distributed
  persist, KHÔNG còn outbox job → luồng kết thúc
```

Đọc lại trace này vài lần. Khi bạn hình dung được state chảy qua từng turn, bạn đã nắm phần lớn Phase 2.

---

## 2. Outbox — vì sao không đẩy thẳng vào queue?

Cách làm ngây thơ cho bước 4-5 sẽ là:

```ts
// SAI — hai hệ thống khác nhau, không atomic
await db.save(distribution);         // ghi Postgres
await queue.add('sftp-upload', ...); // enqueue Redis
```

Vấn đề: giữa 2 dòng, server có thể chết. Hai kịch bản hỏng:
- Chết sau dòng 1, trước dòng 2 → DB nói "đã tới bước upload" nhưng **không có job nào** được enqueue. Release **treo vĩnh viễn**.
- Đảo thứ tự rồi chết giữa chừng → job đã chạy nhưng DB chưa lưu → **thực thi 2 lần**.

Gốc rễ: Postgres và Redis là hai hệ thống tách biệt, không chung transaction. **Outbox** né vấn đề này — thay vì enqueue ngay, ta ghi "ý định enqueue" vào **cùng transaction** với state:

```ts
// ĐÚNG — một transaction: hoặc cả hai cùng commit, hoặc cả hai cùng rollback
await db.transaction(async (tx) => {
  await tx.save(distribution);              // state mới
  await tx.insert(distribution_event, ...); // lịch sử
  await tx.insert(outbox_event, {...});     // ý định enqueue — CHƯA enqueue
});
```

Sau đó một tiến trình riêng — **outbox relay** — đọc `outbox_event WHERE dispatched_at IS NULL`, enqueue vào queue, rồi set `dispatched_at = now()`. Nếu relay chết giữa chừng, lần sau nó thấy job chưa dispatch → enqueue lại. Đây là **at-least-once**: ít nhất một lần, có thể trùng — nên job phải idempotent (mục 3).

> Ẩn dụ: đang nấu ăn thì đừng tự chạy ra bưu điện gửi thư (dễ cháy nồi). Cứ **bỏ thư vào hộp outbox**; người đưa thư (relay) gom đi sau. Việc nấu ăn (transaction DB) không bị gián đoạn bởi việc gửi thư.

`FOR UPDATE SKIP LOCKED` trong câu SELECT của relay: nhiều relay chạy song song, mỗi cái khoá phần của mình, không giẫm chân nhau.

---

## 3. Idempotency — vì sao mọi job mang `key`?

Vì outbox at-least-once + BullMQ retry → **một job CÓ THỂ chạy 2 lần**. Nếu job "cấp UPC" chạy 2 lần → 2 mã UPC cho 1 release = hỏng.

Ba lớp chống trùng:

1. **BullMQ dedupe**: đặt `jobId = idempotencyKey`. BullMQ từ chối job trùng jobId đang tồn tại. Chặn phần lớn trùng lặp.
2. **Side-effect tự kiểm "đã làm chưa"**: port `IdentifierProvisioner` ghi rõ trong comment — "already provisioned → returns the existing value, never mints a new one". Adapter phải kiểm "release này có UPC chưa?" trước khi cấp. Đây mới là idempotency thật, không phụ thuộc queue.
3. **Aggregate guard**: các method có sẵn guard idempotent, vd `submit()` đầu hàm `if (state === VALIDATING) return;`. Gọi 2 lần thì lần 2 là no-op, không push event kép.

Lớp 3 Phase 1 đã lo. Việc của bạn ở Phase 2 là đảm bảo lớp 1 (đặt `jobId`) và lớp 2 (adapter tự kiểm) đúng.

---

## 4. Từng file làm gì — bản đồ để gõ

Đi từ trong (ít phụ thuộc) ra ngoài. Đây là thứ tự nên code.

### `application/ports/workflow-engine.port.ts` — port của nhịp (interface)
Chỉ là chữ ký (giống 9 port domain). Định nghĩa `enqueue()` + `schedule()`. KHÔNG biết BullMQ.
```ts
// skeleton gợi ý — bạn tự hoàn thiện
export type QueueName = 'dist.orchestrate' | 'dist.provision-id' | /* ... */;
export interface EnqueueOpts { delayMs?: number; jobId?: string; attempts?: number; }
export interface JobPayload { distributionId: string; command: string; key: string; /* + tuỳ queue */ }
export interface WorkflowEnginePort {
  enqueue(queue: QueueName, job: JobPayload, opts?: EnqueueOpts): Promise<void>;
  schedule(queue: QueueName, job: JobPayload, at: Date): Promise<void>;
}
```

### `application/ports/unit-of-work.port.ts` — ranh giới transaction
Cho phép handler chạy nhiều thao tác DB trong 1 transaction mà không biết TypeORM.
```ts
export interface UnitOfWork {
  run<T>(work: (ctx: TxContext) => Promise<T>): Promise<T>;
}
```

### `infrastructure/workflow/in-memory-workflow.adapter.ts` — adapter giả cho test
Implement `WorkflowEnginePort` bằng mảng trong RAM. Điểm mấu chốt: **không dùng setTimeout thật** — lưu job kèm `runAt`, test gọi `advanceTime()` để tua thời gian ảo. Đây là cách test "chờ 5 ngày" chạy xong trong 1ms.
```ts
// skeleton gợi ý
export class InMemoryWorkflowAdapter implements WorkflowEnginePort {
  readonly enqueued: Array<{ queue: string; job: JobPayload; runAt: number }> = [];
  private clockMs = 0;
  async enqueue(queue, job, opts = {}) {
    this.enqueued.push({ queue, job, runAt: this.clockMs + (opts.delayMs ?? 0) });
  }
  async schedule(queue, job, at) { /* runAt = at.getTime() */ }
  // test helper: lấy job đã "đến giờ"
  due(): typeof this.enqueued { return this.enqueued.filter(j => j.runAt <= this.clockMs); }
  advanceTime(ms: number) { this.clockMs += ms; }
}
```

### `infrastructure/persistence/*.orm-entity.ts` + migration — trí nhớ
4 TypeORM entity map đúng cột trong schema (mục Persistence của spec). Cột phải khớp `DistributionSnapshotRow`/`ChannelDeliveryRow` để `rehydrate` đọc được.

### `infrastructure/persistence/distribution.repository.ts` — load + save
- `load(id)`: đọc rows → `Distribution.rehydrate(row, channels.map(ChannelDelivery.rehydrate))`.
- `saveWithOutbox(dist, events)`: mở transaction → update state + upsert channels + insert events + insert outbox. Đây là **file cốt lõi nhất**, nên tự code.

### `infrastructure/test-doubles/*.ts` — 9 adapter giả
Mỗi port một fake in-memory: Clock trả giờ cố định, provisioner trả `Upc('...')`, uploader trả `{ok:true}`. Để test handler không cần SFTP/gRPC thật.

### `application/orchestrate.handler.ts` — vòng lặp (mục 1)
Ghép mọi thứ: load → apply → pull → saveWithOutbox. **File cốt lõi**, tự code.

### `application/step-runners/*.ts` — mỗi bước một runner
Nhận job từ queue chuyên biệt → gọi port → enqueue command STEP_DONE/STEP_FAILED về `dist.orchestrate`. Tự code 1 cái mẫu (upload), còn lại lặp pattern.

### `infrastructure/relay/outbox-relay.ts` — người đưa thư (mục 2)
Polling: đọc outbox chưa dispatch → `engine.enqueue()` → mark dispatched.

### `infrastructure/workflow/bullmq-workflow.adapter.ts` — adapter thật (step cuối)
Implement `WorkflowEnginePort` bằng `new Queue()` của bullmq. `delayMs` → BullMQ `{ delay }`. `jobId` → dedupe.

---

## 5. Bắt tay: Step 1 làm gì, tự kiểm thế nào

**Mục tiêu Step 1:** dựng 2 port + 1 adapter giả + module rỗng. Chưa đụng DB, chưa đụng BullMQ. Có 1 test nhỏ chứng minh adapter giả hoạt động.

Checklist:
1. Tạo `application/ports/workflow-engine.port.ts` (dùng skeleton mục 4).
2. Tạo `application/ports/unit-of-work.port.ts`.
3. Tạo `infrastructure/workflow/in-memory-workflow.adapter.ts` (chú ý `advanceTime` để tua thời gian).
4. Tạo `distribution-orchestration.module.ts` (khai báo tối thiểu, chưa cần nhiều provider).
5. Viết 1 spec nhỏ: enqueue 1 job `delayMs=1000` → `due()` rỗng; `advanceTime(1000)` → `due()` có 1 job. Chứng minh cơ chế "chờ không block".

**Tự kiểm:** `npx tsc --noEmit` sạch + test nhỏ xanh + guard `no-framework-import.spec.ts` vẫn xanh (vì bạn không đụng `domain/`).

---

## 6. Hai câu tự trả lời TRƯỚC khi gõ (để hiểu, không chép)

1. **`WorkflowEnginePort` đặt ở `application/` hay `domain/`?**
   Gợi ý: aggregate `Distribution` có bao giờ gọi `enqueue()` không? Port domain là thứ *domain cần để hoàn thành nghiệp vụ* (Clock, provisioner). "Enqueue job" là việc *điều phối*, domain không quan tâm. → đặt đâu?

2. **`InMemoryWorkflowAdapter` test "chờ 5 ngày" mà không chờ thật, bằng cách nào?**
   Gợi ý: đừng dùng `setTimeout`. Lưu `runAt` (mốc thời gian ảo), cho test một cách "tua thời gian". Đây cũng là lý do Clock là port — thời gian phải điều khiển được trong test.

Trả lời được 2 câu này là bạn sẵn sàng. Code xong Step 1, tôi review.

