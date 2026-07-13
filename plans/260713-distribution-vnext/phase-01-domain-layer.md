# Phase 1 — Domain layer thuần (aggregate + value object + event + port)

**Priority:** Cao (nền cho mọi phase sau) · **Status:** 📐 Đặc tả sát code (chưa wire vào project) · **Chạy production:** không đụng luồng v3

> Đặc tả này chi tiết tới mức chữ ký TS + bảng transition + danh sách invariant + kế hoạch test.
> Khi EXECUTE phase, dịch thẳng đặc tả này thành file `.ts` dưới `src/modules/distribution-orchestration/domain/`.
> Nguyên tắc bất di: **domain KHÔNG import `@nestjs/*`, `typeorm`, `ssh2-*`, `bullmq`, `xstate`.**

## Context Links

- Kiến trúc: [`../../docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md`](../../docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md) §4, §5, §7, §9, §10
- Sơ đồ e2e: [`../../docs/flow-release-submit-new/so-do-end-to-end-bullmq-xstate.md`](../../docs/flow-release-submit-new/so-do-end-to-end-bullmq-xstate.md) (state machine C.2, C.3)
- Code v3 đối chiếu: [`../../docs/flow-release-submit-new/tong-quan-luong-phat-hanh-hien-tai.md`](../../docs/flow-release-submit-new/tong-quan-luong-phat-hanh-hien-tai.md)
- Enum v3 tái dùng ngữ nghĩa: `src/modules/release/modules/release-executions3/enums/release-execution3.enum.ts`

## Overview

Tách **domain thuần** (framework-free): aggregate + value object + domain event + port interface + policy theo ExecutionType. Test bằng unit test thuần — feed event, assert state + event phát ra, không cần SFTP/CI/DB/queue thật.

**Quyết định vị trí (đã chốt 2026-07-13):** module mới `src/modules/distribution-orchestration/` (top-level).
Lý do: tên `distribution` đã bị module **config** chiếm (aggregator / dsp-routing / sftp-configs / sftp-connect / file-metadata CI — đó là bounded context *Distribution Configuration*); `release-executions3` là v3 đang chạy. Module mới = bounded context lõi *Distribution Orchestration* tách bạch, khớp đúng tên trong doc §5.

## Nguyên tắc nền: State 2 tầng (đã chốt 2026-07-13)

> Đây là quyết định định hình toàn bộ đặc tả. **KHÔNG bê step v3 thành state.**

- **State = cột mốc (milestone)**, ít, dùng chung vốn từ, cả 3 đối tượng (user / kiểm duyệt viên / admin) đọc được. Chỉ là state khi: (a) là **điểm chờ thật** cần `scheduledAt`/tín hiệu người, hoặc (b) là **mốc quyết định** orchestrator phải hành động.
- **Chi tiết kỹ thuật = domain event trên timeline** (import batch, QA flag, export, retry lần mấy...). Admin/dev đọc chuỗi event để biết "đang làm gì bên trong"; user chỉ thấy state milestone. → khớp CQRS-lite + observability (doc §11, §12).
- **Thao tác nhanh KHÔNG là state.** Kiểm tra kết quả import, soi QA flag = event khi resolve điểm chờ; hỏng → `ISSUES`. Không tạo state riêng cho mỗi lần gọi API.
- **Projection cho từng đối tượng** (phase 3, read side): map state machine → nhãn user-facing. VD `PROVISIONING_IDS` + `BUILDING_PACKAGE` (giữ riêng ở machine để orchestrator sequence rõ + admin debug) → cùng gộp thành **"Đang chuẩn bị"** cho user.

## Key Insights

1. **Lỗi KHÔNG revert về DRAFT.** `DRAFT` chỉ tồn tại **trước submit, vào đúng 1 lần**. Sau submit, mọi lỗi → tạo ticket/issue + vào `ACTION_REQUIRED` (trước khi đẩy kênh) hoặc channel `ISSUES` → `PARTIALLY_DISTRIBUTED`/`FAILED` (sau khi đẩy kênh). User/reviewer sửa → `resubmit()` chạy **lại VALIDATING**, KHÔNG qua DRAFT. (`ReleaseStatus` của bản ghi release là chuyện Release Authoring, độc lập `DistributionState`.)
2. **Wait-bound, không throughput-bound.** Domain KHÔNG `sleep`/`await` I/O. "Chờ" = ghi state milestone chờ + `scheduledAt`; hẹn giờ là việc engine (phase 2).
3. **Domain thuần = quyết định transition, KHÔNG chạy side-effect.** `(state, event) → (state', domainEvents[])`. Port là **chữ ký** cho application gọi.
4. **Idempotency-first.** Transition gọi lại ở state đích → no-op, không phát event trùng, không ném lỗi.
5. **Luồng channel là DỮ LIỆU, không hardcode.** Mỗi DSP/aggregator khai `DeliveryProcess` riêng (danh sách `Stage` có `kind` ACTION/WAIT/GATE) → ánh xạ lên vốn từ `ChannelState` CHUNG nhỏ (PENDING/DELIVERING/WAITING/terminal). Domain giữ **interpreter thuần + invariant**; thêm/sửa luồng 1 DSP = sửa dữ liệu, KHÔNG đụng aggregate. `ChannelState` không đổi. `topology`/`aggregatorCode`/`exportMethod` = cấu hình chọn `process.code` + adapter, KHÔNG lái transition. Đây là nguồn duy nhất cho cả interpreter (phase 1) lẫn XState machine (phase 2).
6. **ExecutionType = policy, KHÔNG phải 4 luồng.** 1 khung machine + strategy bật/tắt mốc. RETRY = reset subtree trên distribution đang tồn tại (không tạo mới).
7. **Bubble-up là logic domain.** DELIVERING tổng hợp channel → DISTRIBUTED / PARTIALLY_DISTRIBUTED / FAILED, gom vào aggregate (không rải rác). Tham khảo cách v3 resolve, nhưng KHÔNG copy code.
8. **Snapshot bất biến**: domain giữ **con trỏ** `snapshotId` + dữ liệu tối thiểu để quyết định (danh sách DSP, cờ đã-có-UPC/ISRC). Payload đầy đủ ở jsonb Postgres, load qua port khi cần.

## Requirements

### Functional
- FR1 — Aggregate `Distribution` mô hình hoá state machine **milestone** cấp release (DRAFT → … → DISTRIBUTED/PARTIALLY_DISTRIBUTED/FAILED/TAKEN_DOWN, lỗi → ACTION_REQUIRED) với guard + phát domain event. KHÔNG revert DRAFT sau submit.
- FR2 — Entity `ChannelDelivery` chạy trên `DeliveryProcess` (dữ liệu per-DSP) qua **interpreter thuần** (`process, pos, state, event`)→(`pos', state', events[]`); ánh xạ stage lên vốn từ `ChannelState` chung. Chi tiết trong stage = event, không phải state.
- FR3 — Value object tự-validate: `Upc`, `Isrc`, `PackagePath`, `RetryPolicy`, `ExecutionType`, `DspCode`, `ChannelTopology` (metadata), `CorrelationId`, `IdempotencyKey`, `TenantId`, `ScheduledAt`. Type dữ liệu: `Stage`, `DeliveryProcess`, `ChannelDeliverySpec`.
- FR4 — Domain event (past-tense, ubiquitous language) phát ra từ transition; dùng cho outbox + timeline (phase 3).
- FR5 — Port interface (chỉ chữ ký): `IdentifierProvisioner`, `PackageBuilder`, `PackageUploader`, `IngestResultReader`, `QaChecker`, `Exporter`, `DeliveryStatusReader`, `TicketService`, `Clock`.
- FR6 — `ExecutionPolicy` strategy theo `ExecutionType`: bật/tắt PROVISIONING_IDS, BUILD+UPLOAD, re-import, hướng cuối (DISTRIBUTED vs TAKEN_DOWN), giới hạn retry.
- FR7 — Aggregate tổng hợp trạng thái channel → resolve state cấp distribution (bê logic bubble-up v3).

### Non-functional
- NFR1 — `tsc` sạch (tuân `strictNullChecks`, `noImplicitAny`).
- NFR2 — 0 dòng import framework/hạ tầng trong `domain/`. Có test guard (grep) chặn regression.
- NFR3 — File < 200 LOC (CLAUDE.md); tách theo aggregate/VO.
- NFR4 — Test thuần in-memory, không I/O, chạy < 1s toàn bộ domain suite.

## Architecture — Cấu trúc thư mục

```text
src/modules/distribution-orchestration/
└── domain/
    ├── distribution/
    │   ├── distribution.aggregate.ts          # aggregate root: state + transition + invariant
    │   ├── distribution-state.enum.ts          # DRAFT..TAKEN_DOWN
    │   └── distribution.types.ts               # props/snapshot-ref types (thuần)
    ├── channel-delivery/
    │   ├── channel-delivery.entity.ts          # entity con: processCode+pos+state; gọi interpreter
    │   ├── channel-state.enum.ts               # vốn từ CHUNG: PENDING/DELIVERING/WAITING/terminal
    │   ├── channel-topology.enum.ts            # DIRECT | VIA_AGGREGATOR (metadata, không lái transition)
    │   ├── channel-delivery-spec.ts            # spec: dspCode, topology, processCode, aggregatorCode?, exportMethod?, hasDeal?
    │   ├── delivery-process.ts                 # type Stage/StageKind/DeliveryProcess (dữ liệu)
    │   ├── delivery-process.registry.ts        # map dsp/aggregator → DeliveryProcess (dữ liệu, có thể seed từ config)
    │   └── channel-interpreter.ts              # hàm thuần (process,pos,state,event)→(pos',state',events[])
    ├── value-objects/
    │   ├── upc.vo.ts
    │   ├── isrc.vo.ts
    │   ├── package-path.vo.ts
    │   ├── retry-policy.vo.ts
    │   ├── execution-type.vo.ts                # wrap enum + helper is*()
    │   ├── dsp-code.vo.ts
    │   ├── correlation-id.vo.ts
    │   ├── idempotency-key.vo.ts
    │   ├── tenant-id.vo.ts
    │   ├── scheduled-at.vo.ts
    │   └── ticket-ref.vo.ts                     # TicketRef + TicketReason (ticket riêng orchestration)
    ├── events/
    │   ├── domain-event.base.ts                # interface DomainEvent + base fields
    │   ├── distribution.events.ts              # event cấp distribution
    │   └── channel.events.ts                   # event cấp channel
    ├── policies/
    │   ├── execution-policy.port.ts            # interface strategy theo type
    │   ├── initial-release.policy.ts
    │   ├── update.policy.ts
    │   ├── takedown.policy.ts
    │   └── retry-execution.policy.ts           # wrap policy gốc, bật canRetry()
    ├── ports/
    │   ├── identifier-provisioner.port.ts
    │   ├── package-builder.port.ts
    │   ├── package-uploader.port.ts
    │   ├── ingest-result-reader.port.ts
    │   ├── qa-checker.port.ts
    │   ├── exporter.port.ts
    │   ├── delivery-status-reader.port.ts
    │   ├── ticket-service.port.ts
    │   └── clock.port.ts
    ├── errors/
    │   └── domain-errors.ts                     # InvalidTransitionError, InvariantViolationError...
    └── __tests__/
        ├── distribution.aggregate.spec.ts
        ├── channel-delivery.entity.spec.ts
        ├── value-objects.spec.ts
        └── no-framework-import.spec.ts          # guard NFR2
```

> Quy ước tên: kebab-case, hậu tố `.aggregate.ts` / `.entity.ts` / `.vo.ts` / `.port.ts` / `.events.ts` / `.enum.ts` để Grep/Glob nhận ra vai trò ngay. `.port.ts` = interface thuần, đặt trong domain vì domain SỞ HỮU hợp đồng; adapter (phase 4) implement từ ngoài.

## Architecture — State machine cấp Distribution (milestone)

### `DistributionState` enum

```ts
export enum DistributionState {
  DRAFT = 'DRAFT',                       // trước submit — vào đúng 1 lần, KHÔNG quay lại
  VALIDATING = 'VALIDATING',             // đang kiểm tra schema/asset
  IN_REVIEW = 'IN_REVIEW',               // chờ kiểm duyệt viên (chỉ khi tenant.requiresManualReview)
  PROVISIONING_IDS = 'PROVISIONING_IDS', // cấp UPC/ISRC (INITIAL); UPDATE: đi qua nhưng no-op
  BUILDING_PACKAGE = 'BUILDING_PACKAGE', // DDEX XML + folder → GCS/S3 (TAKEDOWN: skip)
  DELIVERING = 'DELIVERING',             // fan-out channel song song
  // terminal / bán-terminal
  DISTRIBUTED = 'DISTRIBUTED',           // mọi channel done
  PARTIALLY_DISTRIBUTED = 'PARTIALLY_DISTRIBUTED', // ≥1 done & ≥1 issues
  FAILED = 'FAILED',                     // 0 channel done
  ACTION_REQUIRED = 'ACTION_REQUIRED',   // lỗi validate / reviewer reject → cần user/reviewer sửa (KHÔNG phải DRAFT)
  TAKEN_DOWN = 'TAKEN_DOWN',
}
```

> Đổi so với bản trước: `AWAITING_REVIEW`→`IN_REVIEW` (nhãn người-đọc), `DISTRIBUTING`→`DELIVERING`, **bỏ `REJECTED`**, thêm **`ACTION_REQUIRED`**. `PROVISIONING_IDS`+`BUILDING_PACKAGE` giữ riêng ở machine (orchestrator sequence + admin debug), read-projection gộp thành **"Đang chuẩn bị"** cho user.

### Projection user-facing (phase 3 làm, ghi ở đây để nhất quán)

| Nhóm state machine | Nhãn user | Nhãn reviewer | Nhãn admin |
|---|---|---|---|
| DRAFT | Nháp | — | draft |
| VALIDATING | Đang kiểm tra | — | validating |
| IN_REVIEW | Chờ duyệt | **Cần tôi duyệt** | in_review |
| PROVISIONING_IDS, BUILDING_PACKAGE | Đang chuẩn bị | — | provisioning / building (chi tiết ở event) |
| DELIVERING | Đang phát hành | — | delivering (kèm tiến độ n/N kênh) |
| DISTRIBUTED | Đã phát hành | — | distributed |
| PARTIALLY_DISTRIBUTED | Phát hành một phần | — | partial (kênh nào ISSUES ở event) |
| FAILED | Thất bại | — | failed |
| ACTION_REQUIRED | **Cần bạn sửa** | lý do reject | action_required (ticket id) |
| TAKEN_DOWN | Đã gỡ | — | taken_down |

### Bảng transition

| From | Method (command) | Guard | → To | Domain event |
|------|------------------|-------|------|--------------|
| DRAFT | `submit()` | có ≥1 channel; snapshotId set | VALIDATING | `DistributionSubmitted` |
| VALIDATING | `markValidated()` | rẽ theo policy + `requiresReview` | IN_REVIEW *hoặc* PROVISIONING_IDS *hoặc* DELIVERING¹ | `Validated` |
| VALIDATING | `flagValidationErrors(ticketRef, errors)` | — · **tạo ticket** | ACTION_REQUIRED | `ValidationErrorsFlagged` |
| IN_REVIEW | `approveReview(reviewerId)` | — · rẽ theo policy | PROVISIONING_IDS *hoặc* DELIVERING¹ | `ReviewApproved` |
| IN_REVIEW | `rejectReview(reviewerId, ticketRef, note)` | — · **tạo ticket** | ACTION_REQUIRED | `ReviewRejected` |
| ACTION_REQUIRED | `resubmit()` | user/reviewer đã sửa | VALIDATING | `Resubmitted` |
| PROVISIONING_IDS | `markIdsProvisioned(upc?)` | idempotent: đã đủ id → vẫn tiến | BUILDING_PACKAGE | `IdsProvisioned` |
| BUILDING_PACKAGE | `markPackageBuilt(path)` | `path: PackagePath` hợp lệ | DELIVERING | `PackageBuilt` |
| DELIVERING | `syncChannelOutcome()`² | mọi channel terminal | DISTRIBUTED / PARTIALLY_DISTRIBUTED / FAILED | `Distributed` / `PartiallyDistributed` / `DistributionFailed` |
| PARTIALLY_DISTRIBUTED, FAILED | `resetForRetry(scope)` | policy `canRetry()`; dưới ngưỡng poison | DELIVERING | `RetryReset` |
| DISTRIBUTED, PARTIALLY_DISTRIBUTED | `markTakenDown()`³ | policy TAKEDOWN hoàn tất | TAKEN_DOWN | `TakenDown` |

**Không có transition nào về DRAFT.** Lỗi luôn dừng ở `ACTION_REQUIRED` (trước kênh) hoặc `PARTIALLY_DISTRIBUTED`/`FAILED` (sau kênh), kèm ticket/issue. Chi tiết lỗi nằm ở payload event + ticket, không nhồi vào state.

¹ Rẽ nhánh do `ExecutionPolicy`:
- INITIAL/UPDATE (`needsProvisioning`? INITIAL=true, UPDATE=false nhưng vẫn **đi qua** PROVISIONING_IDS cho đồng nhất — bên trong `markIdsProvisioned` no-op vì đã có id) → PROVISIONING_IDS.
- TAKEDOWN (`needsBuildAndUpload()===false`) → thẳng **DELIVERING**, channel đi nhánh gỡ.
- Nếu tenant bật review: chèn IN_REVIEW giữa VALIDATING và bước kế.

² `syncChannelOutcome()` do event channel kích hoạt (mỗi ChannelDone/ChannelIssues → aggregate re-resolve). Bubble-up ở §Aggregation.

³ TAKEDOWN (đã chốt mô hình **(b)**): `Distribution` riêng `type=TAKEDOWN` cùng `releaseId`. Bảng này áp cho aggregate takedown đó; distribution INITIAL giữ `DISTRIBUTED`.

### Sơ đồ

```text
DRAFT ─submit→ VALIDATING ──pass──→ [tenant review?]
                   │ errors             ├ yes → IN_REVIEW ─approve→ ┐
                   │ (tạo ticket)       └ no ────────────────────→ │
                   ▼                    IN_REVIEW ─reject(ticket)→ ACTION_REQUIRED
             ACTION_REQUIRED ←──────────────────────────────────────┘   │
                   │ resubmit (user/reviewer sửa)                        │
                   └────────────→ VALIDATING                            ▼
                                                        [policy cần provision?]
                                              PROVISIONING_IDS → BUILDING_PACKAGE
                                                     (TAKEDOWN bỏ 2 bước) ↓
                                                                    DELIVERING
                                          ┌──────────────┬───────────────┐
                                          ▼              ▼               ▼
                                    DISTRIBUTED   PARTIALLY_DISTRIBUTED  FAILED
                                                     │ retry(admin)   │ retry(admin)
                                                     └───────┬────────┘
                                                             ▼ resetForRetry → DELIVERING
```

## Architecture — Channel: Process-as-Data + Interpreter thuần

**Sửa (theo phản hồi): KHÔNG hardcode trình tự vào domain.** Mỗi DSP/aggregator có quy trình khác nhau (Spotify ≠ Vevo ≠ CI ≠ aggregator mai sau; khác bước, khác điểm chờ, khác gate, khác cả takedown). Hai bảng transition cứng theo topology sẽ vỡ khi thêm DSP có nhịp khác.

Tách **cái thay đổi** (định nghĩa luồng per-DSP) khỏi **cái chung** (vốn từ state + invariant + interpreter). Domain sở hữu phần chung; mỗi DSP **khai luồng của nó bằng dữ liệu**. Thêm/sửa luồng 1 DSP = sửa dữ liệu, KHÔNG đụng aggregate.

> Đây là nguồn duy nhất cho cả interpreter thuần (phase 1: chỉ check invariant + đồng bộ, không side-effect) lẫn machine XState durable (phase 2: chạy thật). XState vốn là "machine mô tả bằng dữ liệu" → `DeliveryProcess` chính là hình dạng machine đó. Không phải engine thứ hai.

### `ChannelState` — vốn từ CHUNG (cố định, nhỏ, cho cả 3 đối tượng)

Luồng riêng chỉ **ánh xạ bước của nó lên** tập state này — không DSP nào tự thêm state, để user/reviewer/admin thấy nhất quán.

```ts
export enum ChannelState {
  PENDING = 'PENDING',                 // chưa bắt đầu
  DELIVERING = 'DELIVERING',           // đang chạy 1 stage ACTION (build/upload/... chi tiết ở event)
  WAITING = 'WAITING',                 // đang ở 1 stage WAIT (chờ ngoài, có scheduledAt)
  // terminal
  LIVE = 'LIVE',                       // đi hết process phân phối → thành công
  ISSUES = 'ISSUES',                   // lỗi, có ticket — chờ retry
  TAKEN_DOWN = 'TAKEN_DOWN',
  SKIPPED = 'SKIPPED',
}
```

> `ChannelState` giờ **rất nhỏ**: PENDING / DELIVERING / WAITING + terminal. Chi tiết "đang chờ ai" (partner? ingest? export? go-live?) nằm ở **stage hiện tại của process** (`process[pos].key` + `.waitKind`), không phải ở tên state. Projection UI đọc `waitKind` để hiện "Chờ Spotify duyệt" / "Chờ CI xử lý" / "Chờ lên sóng". Nhờ vậy thêm loại chờ mới của 1 DSP = thêm stage trong dữ liệu, không thêm state vào enum chung.

### `DeliveryProcess` — luồng khai bằng DỮ LIỆU (mỗi DSP/aggregator 1 định nghĩa)

```ts
export enum StageKind {
  ACTION = 'ACTION', // ta chủ động làm (build, upload+import, export...) → state DELIVERING
  WAIT   = 'WAIT',   // chờ ngoài (DSP duyệt, aggregator ingest, DSP live) → state WAITING + scheduledAt
  GATE   = 'GATE',   // điểm kiểm tra pass/fail (QA...) → phải PASS mới qua stage sau, fail → ISSUES
}

export interface Stage {
  readonly key: string;          // định danh stage trong process, vd 'deliver' | 'ingest' | 'qa' | 'export'
  readonly kind: StageKind;
  readonly waitKind?: string;    // nhãn chờ cho UI/projection, vd 'PARTNER'|'INGEST'|'EXPORT'|'GO_LIVE' (chỉ WAIT)
  readonly retryable?: boolean;  // ACTION có áp RetryPolicy không (vd upload ≤3)
}

export interface DeliveryProcess {
  readonly code: string;         // vd 'spotify.initial' | 'ci.deal.initial' | 'ci.takedown'
  readonly stages: readonly Stage[];  // thứ tự tuyến tính; interpreter đi từ pos 0 → cuối
}
```

Ví dụ (dữ liệu, không phải code domain — nằm ở registry, load từ config DSP):

```ts
// Spotify (direct) — 1 điểm chờ
spotifyInitial = { code: 'spotify.initial', stages: [
  { key: 'deliver', kind: ACTION, retryable: true },       // build + upload SFTP
  { key: 'partner', kind: WAIT,   waitKind: 'PARTNER' },   // chờ DSP duyệt 1–5 ngày
]}

// CI có deal (aggregator) — upload = đã import; 2 điểm chờ + 1 gate QA
ciDealInitial = { code: 'ci.deal.initial', stages: [
  { key: 'deliver', kind: ACTION, retryable: true },       // build + upload folder + .done = ĐÃ import
  { key: 'ingest',  kind: WAIT,   waitKind: 'INGEST' },    // chờ CI xử lý batch đã import, trả kết quả
  { key: 'qa',      kind: GATE },                          // QA flags: pass → tiếp, fail → ISSUES
  { key: 'export',  kind: WAIT,   waitKind: 'EXPORT' },    // chờ export (admin panel; State51 = email batch)
  { key: 'golive',  kind: WAIT,   waitKind: 'GO_LIVE' },   // chờ DSP live
]}

// CI takedown — gỡ cả cụm; khác hẳn 2 cái trên
ciTakedown = { code: 'ci.takedown', stages: [
  { key: 'request', kind: ACTION },                        // gửi lệnh gỡ cụm
  { key: 'confirm', kind: WAIT, waitKind: 'TAKEDOWN' },    // chờ CI xác nhận gỡ
]}
```

→ Thêm DSP direct mới nhịp khác / đổi aggregator / đổi cả takedown = **thêm/sửa 1 `DeliveryProcess`** trong registry. Aggregate + interpreter + `ChannelState` **không đổi dòng nào**. `exportMethod`/`aggregatorCode`/`hasDeal` vẫn là dữ liệu cấu hình (chọn `process.code` + adapter nào chạy stage ACTION), không rẽ state.

### Interpreter thuần (trong domain, đọc process — KHÔNG side-effect)

```ts
// ChannelDelivery giữ: processCode, pos (chỉ số stage hiện tại), state, retryCount, ticketRef?
// interpreter = hàm thuần (process, pos, state, event) → (pos', state', events[])

advance(event):
  STEP_DONE  ở ACTION            → pos++; nếu stage kế WAIT → state=WAITING (+scheduledAt do engine set); nếu hết → LIVE
  ARRIVED    ở WAIT (đánh thức)  → coi như STEP_DONE của WAIT → pos++ (hoặc LIVE nếu cuối)
  GATE_PASS  ở GATE              → pos++
  GATE_FAIL  ở GATE              → state=ISSUES (+ticketRef)
  ACTION_FAIL retryable & dưới max → retryCount++, giữ DELIVERING; quá max → ISSUES(+ticket)
  ACTION_FAIL non-retry / WAIT_FAIL → ISSUES(+ticket)
  RESET (chỉ RETRY, dưới poison) → pos = stage hợp lệ trước điểm lỗi; state theo stage đó
```

Chi tiết trong 1 stage (build xong / upload xong / đang QA) = **domain event** (`level:'progress'`), không đổi `pos`/`state`.

## Architecture — Value Objects (chữ ký + luật)

Nguyên tắc VO: **immutable, tự-validate trong factory, so sánh bằng giá trị**. Không throw generic `Error` — dùng `InvariantViolationError` (§errors). Mỗi VO có `static create()` (validate) + `equals()` + `toString()`/`value`.

```ts
// base pattern (không cần class base, dùng convention cho nhẹ)
export class Upc {
  private constructor(public readonly value: string) {}
  static create(raw: string): Upc {
    const v = raw.trim();
    // UPC/EAN: 12–14 chữ số (GTIN-12/13/14). Domain chỉ validate hình thức, không check-digit ở đây.
    if (!/^\d{12,14}$/.test(v)) throw new InvariantViolationError('Upc', `invalid: ${raw}`);
    return new Upc(v);
  }
  equals(o: Upc): boolean { return this.value === o.value; }
}

export class Isrc {
  private constructor(public readonly value: string) {}
  static create(raw: string): Isrc {
    const v = raw.trim().toUpperCase().replace(/-/g, '');
    // ISRC: CC-XXX-YY-NNNNN → 12 ký tự sau khi bỏ gạch: 2 alpha + 3 alnum + 2 digit + 5 digit
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/.test(v)) throw new InvariantViolationError('Isrc', `invalid: ${raw}`);
    return new Isrc(v);
  }
  equals(o: Isrc): boolean { return this.value === o.value; }
}

export class PackagePath {
  // con trỏ tới package đã build trên GCS/S3 — KHÔNG chứa file, chỉ path + checksum.
  private constructor(
    public readonly bucket: string,
    public readonly key: string,        // vd "packages/20260713153012123/"
    public readonly checksum?: string,  // sha256 tùy chọn để verify idempotent
  ) {}
  static create(bucket: string, key: string, checksum?: string): PackagePath {
    if (!bucket) throw new InvariantViolationError('PackagePath', 'empty bucket');
    // folder theo convention v3: YYYYMMDDHHmmssSSS
    if (!/^[\w\-./]+$/.test(key)) throw new InvariantViolationError('PackagePath', `bad key: ${key}`);
    return new PackagePath(bucket, key, checksum);
  }
  get uri(): string { return `${this.bucket}/${this.key}`; }
  equals(o: PackagePath): boolean { return this.uri === o.uri && this.checksum === o.checksum; }
}

export class RetryPolicy {
  // Luật SFTP theo spec: tối đa 3 lần rồi skip. Backoff để engine (phase 2) dùng, domain chỉ giữ tham số.
  private constructor(
    public readonly maxAttempts: number,      // vd 3
    public readonly backoffMs: number,        // base backoff, engine nhân theo attempt
    public readonly strategy: 'fixed' | 'exponential',
  ) {}
  static sftpDefault(): RetryPolicy { return new RetryPolicy(3, 30_000, 'exponential'); }
  static create(maxAttempts: number, backoffMs: number, strategy: 'fixed' | 'exponential'): RetryPolicy {
    if (maxAttempts < 1) throw new InvariantViolationError('RetryPolicy', 'maxAttempts >= 1');
    return new RetryPolicy(maxAttempts, backoffMs, strategy);
  }
  canRetry(currentCount: number): boolean { return currentCount < this.maxAttempts; }
}

export class ExecutionType {
  // wrap enum v3 để có helper — GIỮ giá trị khớp release-execution3.enum.ts (migration v3 dễ)
  private constructor(public readonly value: ExecutionTypeEnum) {}
  static of(v: ExecutionTypeEnum): ExecutionType { return new ExecutionType(v); }
  get isInitial(): boolean { return this.value === ExecutionTypeEnum.INITIAL_RELEASE; }
  get isUpdate(): boolean { return this.value === ExecutionTypeEnum.UPDATE; }
  get isTakedown(): boolean { return this.value === ExecutionTypeEnum.TAKEDOWN; }
  get isRetry(): boolean { return this.value === ExecutionTypeEnum.RETRY; }
}

// enum tách file để migration v3 tái dùng giá trị chuỗi y hệt
export enum ExecutionTypeEnum {
  INITIAL_RELEASE = 'INITIAL_RELEASE',
  UPDATE = 'UPDATE',
  TAKEDOWN = 'TAKEDOWN',
  RETRY = 'RETRY',
}
```

VO nhỏ còn lại (cùng pattern `create/value/equals`, ghi gọn):

| VO | Luật validate | Ghi chú |
|----|---------------|---------|
| `DspCode` | non-empty, `^[A-Z0-9_]+$` | mã DSP (SPOTIFY, VEVO, CI…) |
| `ChannelTopology` | ∈ enum {DIRECT, VIA_AGGREGATOR} | **metadata** (nhãn nhóm UI / chọn process mặc định), KHÔNG lái transition |
| `CorrelationId` | uuid v4 | truyền xuyên queue → log/trace (obs §12) |
| `IdempotencyKey` | non-empty ≤128 | mỗi command mang key; chống replay submit |
| `TenantId` | uuid / định danh tenant | đọc cờ `requiresManualReview` từ context (không nằm trong VO) |
| `ScheduledAt` | `Date` tương lai (hoặc now) | thời điểm đánh thức chờ; domain KHÔNG tự hẹn, chỉ giữ mốc |
| `TicketRef` | non-empty id | tham chiếu ticket **riêng của orchestration**; gắn vào ISSUES/ACTION_REQUIRED |
| `TicketReason` (enum) | ∈ {VALIDATION, REVIEW_REJECT, UPLOAD_FAIL, INGEST_FAIL, QA_FLAG, EXPORT_FAIL, PARTNER_FAIL, TAKEDOWN_FAIL} | phân loại lý do ticket cho UI/lọc |

> **Không** đưa `requiresManualReview` vào aggregate. Cờ này là **input transition** truyền vào `markValidated(policy, requiresReview)` — giữ aggregate không phụ thuộc bảng tenant.

## Architecture — Domain Events

```ts
export interface DomainEvent {
  readonly type: string;            // ubiquitous name, past-tense
  readonly distributionId: string;
  readonly channelId?: string;      // set nếu là event cấp channel
  readonly occurredAt: Date;        // do Clock port cấp (test injectable)
  readonly payload: Record<string, unknown>;
}
```

Aggregate KHÔNG publish trực tiếp — **tích luỹ** event vào `pullDomainEvents(): DomainEvent[]` (application layer đọc rồi ghi outbox trong cùng transaction — phase 3). Đây là mắt xích outbox.

Event chia 2 loại theo tầng 2-tier:
- **Event đổi state** (milestone): kèm transition, timeline hiển thị nổi bật cho user.
- **Event tiến trình** (progress, self-loop trong 1 state): chi tiết cho admin/dev, user không cần thấy. `payload.level: 'milestone' | 'progress'` để projection lọc.

**Distribution-level** (`distribution.events.ts`): `DistributionSubmitted`, `Validated`, `ValidationErrorsFlagged`, `ReviewApproved`, `ReviewRejected`, `Resubmitted`, `IdsProvisioned`, `PackageBuilt`, `Distributed`, `PartiallyDistributed`, `DistributionFailed`, `RetryReset`, `TakenDown`.

**Channel-level** (`channel.events.ts`):
Event channel chung theo interpreter (mang `stageKey` + `waitKind` trong payload để biết stage nào):
- milestone (đổi `pos`/`state`): `ChannelStarted`, `StageStarted` (vào ACTION), `StageCompleted` (ACTION/GATE xong), `Waiting` (vào WAIT, kèm `waitKind`), `WaitResolved` (đánh thức xong), `ChannelLive`, `ChannelIssues` (+ticket), `ChannelReset`, `ChannelTakenDown`.
- progress (self-loop, `level:'progress'`, không đổi pos): tên tự do theo stage, vd `Building`, `Uploading`, `UploadRetried`, `IngestPending`, `QaChecking`, `ExportPending`.

> Không cần event riêng cho từng waitKind (WaitingPartner/WaitingIngest…). Một event `Waiting{waitKind}` đủ — projection map `waitKind` → nhãn UI. Thêm loại chờ mới của 1 DSP = thêm `waitKind` trong dữ liệu process, không thêm event type.

> Mỗi event là 1 factory nhỏ (không class nặng): `makeChannelUploaded(distId, chId, at, {dspCode}) => DomainEvent`. Tên `type` = tên factory bỏ `make`. Timeline (phase 3) map `type` → dòng UI theo `level`.
> `ChannelIssues` luôn có `payload.ticketRef` — nguồn cho user/admin mở ticket.

## Architecture — Aggregate `Distribution` (public API)

```ts
export class Distribution {
  // ── định danh + bất biến ──
  readonly id: string;
  readonly releaseId: string;
  readonly snapshotId: string;
  readonly tenantId: TenantId;
  readonly type: ExecutionType;
  readonly correlationId: CorrelationId;

  // ── state có thể đổi ──
  private _state: DistributionState;
  private _channels: ChannelDelivery[];   // entity con, chỉ sửa qua method aggregate
  private _upc?: Upc;
  private _packagePath?: PackagePath;
  private _pendingEvents: DomainEvent[] = [];

  get state(): DistributionState { return this._state; }
  get channels(): readonly ChannelDelivery[] { return this._channels; }

  // ── factory ──
  static create(props: CreateDistributionProps, clock: Clock): Distribution; // → DRAFT + DistributionSubmitted? (submit tách riêng)

  // ── transition (mỗi cái: guard → đổi state → push event; idempotent) ──
  submit(clock: Clock): void;
  markValidated(policy: ExecutionPolicy, requiresReview: boolean, clock: Clock): void;
  flagValidationErrors(ticketRef: string, errors: string[], clock: Clock): void; // → ACTION_REQUIRED (KHÔNG DRAFT)
  approveReview(reviewerId: string, policy: ExecutionPolicy, clock: Clock): void;
  rejectReview(reviewerId: string, ticketRef: string, note: string, clock: Clock): void; // → ACTION_REQUIRED
  resubmit(clock: Clock): void;                 // ACTION_REQUIRED → VALIDATING (user/reviewer đã sửa)
  markIdsProvisioned(upc: Upc | undefined, clock: Clock): void; // undefined khi UPDATE (đã có id → no-op)
  markPackageBuilt(path: PackagePath, clock: Clock): void;

  // ── channel orchestration ──
  private ensureChannelsSpawned(policy: ExecutionPolicy): void; // khi vào DELIVERING
  applyChannelTransition(channelId: string, apply: (c: ChannelDelivery) => void): void; // gom event con
  syncChannelOutcome(clock: Clock): void; // bubble-up → resolve state distribution

  // ── retry / takedown ──
  resetForRetry(scope: RetryScope, policy: ExecutionPolicy, clock: Clock): void;
  markTakenDown(clock: Clock): void;

  // ── outbox hook ──
  pullDomainEvents(): DomainEvent[]; // trả + clear _pendingEvents

  // ── rehydrate từ persistence (phase 2 repo dùng) ──
  static rehydrate(state: DistributionSnapshotRow, channels: ChannelDelivery[]): Distribution;
}
```

### Aggregation — bubble-up (logic domain, KHÔNG copy code v3)

`syncChannelOutcome()` khi `_state === DELIVERING`, xét terminal state của `_channels` (`LIVE`/`ISSUES`/`TAKEN_DOWN`/`SKIPPED`):

```text
  - còn channel CHƯA terminal → giữ DELIVERING (chưa resolve; "còn chờ" nằm ở channel + scheduledAt)
  - tất cả terminal:
      · mọi channel ∈ {LIVE, SKIPPED}                       → DISTRIBUTED            + Distributed
      · có ≥1 LIVE và có ≥1 ISSUES                           → PARTIALLY_DISTRIBUTED  + PartiallyDistributed
      · 0 channel LIVE (toàn ISSUES/SKIPPED)                 → FAILED                 + DistributionFailed
      · (nhánh TAKEDOWN) mọi channel ∈ {TAKEN_DOWN,SKIPPED}  → TAKEN_DOWN             + TakenDown
```

> Tham khảo tinh thần v3 (`resolveStatusByChild`) nhưng **rút gọn cho terminal-only**: cấp distribution không cần state "đang chờ" riêng. "Còn chờ" = còn channel chưa terminal → ở lại DELIVERING. Khớp wait-bound: chờ nằm ở channel milestone + `scheduledAt`, không bubble lên distribution.

## Architecture — Ports (chỉ chữ ký; adapter ở phase 4)

Port = hợp đồng domain SỞ HỮU. Nhận/trả **VO + type thuần**, KHÔNG trả entity ORM. Có `idempotencyKey` ở mọi thao tác gây side-effect. Trả `Promise` nhưng **domain không gọi** — application/process-manager gọi (phase 2).

```ts
export interface Clock { now(): Date; }   // domain lấy thời gian qua đây, KHÔNG new Date() trực tiếp

export interface IdentifierProvisioner {
  // idempotent: đã có → trả lại cái cũ, không cấp mới
  provisionUpc(input: { releaseId: string; key: IdempotencyKey }): Promise<Upc>;
  provisionIsrcs(input: { trackIds: string[]; key: IdempotencyKey }): Promise<Map<string, Isrc>>;
}

export interface PackageBuilder {
  // sinh DDEX XML + folder YYYYMMDDHHmmssSSS → GCS/S3, trả con trỏ
  build(input: { snapshotId: string; processCode: string; key: IdempotencyKey }): Promise<PackagePath>;
}

export interface PackageUploader {
  // upload 1 package lên 1 host (bulkhead per host ở adapter). Idempotent theo checksum.
  // Với VIA_AGGREGATOR: upload folder + tạo .done = ĐÃ import (không có bước import tách rời).
  upload(input: { path: PackagePath; dspCode: DspCode; key: IdempotencyKey }): Promise<UploadResult>;
  markBatchDone(input: { path: PackagePath; key: IdempotencyKey }): Promise<void>; // tạo folder .done → chốt batch import
}

// đọc kết quả aggregator xử lý batch đã import (không phải "trigger import")
export interface IngestResultReader {
  read(input: { batchId: string; key: IdempotencyKey }): Promise<IngestStatus>; // ok | pending | problem(errors)
}

export interface QaChecker {
  check(input: { releaseId: string; key: IdempotencyKey }): Promise<QaResult>; // clean | flagged(flags)
}

export interface Exporter {
  // 1 method, chọn cơ chế theo exportMethod của channel — KHÔNG tách theo nhà cung cấp
  export(input: { method: ExportMethod; upcs: string[]; recipients?: string[]; key: IdempotencyKey }): Promise<ExportJobRef>;
}

export interface DeliveryStatusReader {
  read(input: { batchId: string; dspCodes: DspCode[] }): Promise<Map<string, DspLiveStatus>>; // poll deliver_desire
}

// Ticket riêng của orchestration (KHÔNG tái dùng issue/release-errors)
export interface TicketService {
  open(input: { distributionId: string; channelId?: string; reason: TicketReason; detail: string; key: IdempotencyKey }): Promise<TicketRef>;
  resolve(input: { ticket: TicketRef }): Promise<void>;
}
```

> Port đổi theo phản hồi: `ImportChecker`→`IngestResultReader` (đọc kết quả xử lý, không trigger import — import đã xong ở bước upload); `createFolderDone`→`markBatchDone`; `Exporter` gộp `exportCi`/`exportEmailBatch` thành 1 `export()` chọn theo `ExportMethod`.

Type hỗ trợ (`UploadResult`, `ImportStatus`, `QaResult`, `ExportJobRef`, `DspLiveStatus`) là plain type/union trong domain — KHÔNG kéo type ORM/CI SDK vào (ACL ở adapter map sang).

## Architecture — ExecutionPolicy (strategy theo type)

```ts
export interface ExecutionPolicy {
  readonly type: ExecutionTypeEnum;
  needsProvisioning(): boolean;           // INITIAL: true; UPDATE/TAKEDOWN: false
  needsBuildAndUpload(): boolean;         // TAKEDOWN: false (dùng process takedown); còn lại true
  canRetry(): boolean;                    // chỉ RETRY policy = true
  terminalIntent(): 'DISTRIBUTED' | 'TAKEN_DOWN';
  // chọn process cho 1 channel theo type + spec (INITIAL/UPDATE → process phân phối; TAKEDOWN → process gỡ)
  resolveProcessCode(spec: ChannelDeliverySpec): string;
  // TAKEDOWN: chọn channel nào gỡ (direct per-DSP; aggregator cả cụm) — quyết ở spawn channel
  selectChannelsForTakedown?(all: ChannelDeliverySpec[]): ChannelDeliverySpec[];
}
```

> Bỏ `channelDirection()` — "phân phối hay gỡ" giờ nằm trong **`process.code`** mà `resolveProcessCode()` chọn (vd `spotify.initial` vs `spotify.takedown`, `ci.deal.initial` vs `ci.takedown`). Takedown khác nhau per-DSP tự nhiên rơi ra từ process riêng, không cần nhánh cứng.

| Policy | needsProvisioning | needsBuildAndUpload | resolveProcessCode | canRetry | terminalIntent |
|--------|-------------------|---------------------|--------------------|----------|----------------|
| `InitialReleasePolicy` | ✅ | ✅ | `{dsp}.initial` | ❌ | DISTRIBUTED |
| `UpdatePolicy` | ❌ (đã có id) | ✅ (re-build + re-deliver) | `{dsp}.initial` (dùng lại luồng phân phối) | ❌ | DISTRIBUTED |
| `TakedownPolicy` | ❌ | ❌ | `{dsp}.takedown` | ❌ | TAKEN_DOWN |
| `RetryExecutionPolicy` | kế thừa policy gốc | kế thừa | kế thừa | ✅ | kế thừa |

> **Đụng tên (đã chốt):** VO `RetryPolicy` (backoff SFTP) giữ nguyên; policy đổi thành **`RetryExecutionPolicy`** để tránh lẫn.
>
> RETRY không phải "type phát hành" độc lập — nó **wrap** policy của distribution gốc và chỉ bật `canRetry()`. `resetForRetry()` dùng nó để hợp lệ hoá việc reset subtree. Khớp doc §7.3.

## Invariants (luật bất biến — test phải phủ hết)

**Distribution:**
- INV-D1 — không vào `PROVISIONING_IDS`/`BUILDING_PACKAGE`/`DELIVERING` nếu chưa qua `VALIDATING` pass (và `IN_REVIEW` approve nếu tenant bật).
- INV-D2 — không `markPackageBuilt` nếu chưa `IdsProvisioned` (policy `needsProvisioning()===false` vẫn **đi qua** PROVISIONING_IDS nhưng no-op — 1 hình machine).
- INV-D3 — **KHÔNG transition nào về DRAFT sau submit.** Lỗi trước-kênh → `ACTION_REQUIRED` (kèm ticket); `resubmit()` chỉ đi `ACTION_REQUIRED → VALIDATING`.
- INV-D4 — chỉ resolve `DISTRIBUTED` khi **mọi** channel ∈ {LIVE, SKIPPED}.
- INV-D5 — `PARTIALLY_DISTRIBUTED` ⟺ ≥1 channel LIVE **và** ≥1 channel ISSUES.
- INV-D6 — `FAILED` ⟺ 0 channel LIVE và mọi channel terminal.
- INV-D7 — `markTakenDown` chỉ hợp lệ khi policy TAKEDOWN và mọi channel ∈ {TAKEN_DOWN, SKIPPED} (mô hình (b): distribution riêng type=TAKEDOWN — xem open #1).
- INV-D8 — `resetForRetry` chỉ khi `state ∈ {PARTIALLY_DISTRIBUTED, FAILED}`, policy `canRetry()`, **dưới ngưỡng poison** → quá ngưỡng ném `RetryLimitExceededError`.
- INV-D9 — transition không hợp lệ ném `InvalidTransitionError(from, method)`; KHÔNG đổi state, KHÔNG phát event.
- INV-D10 — mọi transition **idempotent**: gọi lại ở state đích → no-op, không phát event trùng.

**ChannelDelivery (interpreter — invariant CHUNG cho mọi process):**
- INV-C1 — **không skip stage**: `pos` chỉ tiến +1 khi stage hiện tại hoàn tất đúng loại event (ACTION→STEP_DONE, WAIT→ARRIVED, GATE→GATE_PASS). Không nhảy cóc.
- INV-C2 — ACTION có `retryable` quá `retryPolicy.maxAttempts` → ISSUES (không giữ DELIVERING). Khớp spec SFTP ≤3.
- INV-C3 — **GATE phải PASS mới qua stage sau**; `GATE_FAIL` → ISSUES(+ticket). Không có đường vòng qua GATE.
- INV-C4 — chỉ đạt `LIVE` khi `pos` đã qua **stage cuối** của process (không LIVE giữa chừng).
- INV-C5 — `ChannelState` do interpreter suy ra từ `kind` của stage hiện tại (ACTION→DELIVERING, WAIT→WAITING); không set state tùy tiện ngoài interpreter. Có helper `deriveState(process, pos)`.
- INV-C6 — mọi đường vào `ISSUES` phải kèm `ticketRef` (không lỗi thầm lặng).
- INV-C7 — `RESET` (RETRY) chỉ đưa `pos` về **stage hợp lệ trước điểm lỗi** trong đúng process đó; dưới ngưỡng poison.
- INV-C8 — process hợp lệ: `stages` không rỗng; `WAIT` có `waitKind`; `key` duy nhất trong 1 process (validate ở registry, test phủ).

## Errors (`errors/domain-errors.ts`)

```ts
export class DomainError extends Error {}                     // base, không kéo Nest HttpException
export class InvalidTransitionError extends DomainError {}    // (from, method)
export class InvariantViolationError extends DomainError {}   // (context, message)
export class RetryLimitExceededError extends DomainError {}   // poison detection
```
> Adapter/application (phase sau) map `DomainError` → HTTP/log. Domain KHÔNG biết HTTP.

## Related Code Files

**Tạo mới (dưới `src/modules/distribution-orchestration/domain/`):** toàn bộ cây ở §Cấu trúc thư mục (≈ 26 file `.ts` + 4 spec).

**Đọc tham chiếu (không sửa):**
- `src/modules/release/modules/release-executions3/enums/release-execution3.enum.ts` — khớp giá trị `ExecutionType` để migration v3.
- `src/modules/release/modules/release-executions3/services/release-execution3.engine.ts` — tham khảo tinh thần resolve status (KHÔNG copy code).
- `src/modules/distribution/dsp-routing/enum/dsp-routing.enum.ts` — `RoutingModeEnum` (DIRECT/AGGREGATOR/SYSTEM) → map `ChannelTopology` (metadata).
- `src/modules/distribution/aggregator/*` — `Aggregator` (danh tính CI/…, ddex config) + `hasDeal` → nguồn seed `DeliveryProcess` registry + `ChannelDeliverySpec`.

**Không sửa gì trong `src/`** ở phase này (chỉ đặc tả). File `.ts` được tạo khi EXECUTE.

## Implementation Steps (khi execute)

1. Tạo cây thư mục + `execution-type.enum.ts` (khớp giá trị v3).
2. Errors (`domain-errors.ts`) — nền cho VO validate.
3. Value objects + spec `value-objects.spec.ts` (valid/invalid, equals, immutability).
4. Enum state (distribution + channel) + `channel-topology.enum.ts`.
5. `delivery-process.ts` (Stage/StageKind/DeliveryProcess) + `delivery-process.registry.ts` (dữ liệu 3+ process mẫu: spotify.initial, ci.deal.initial, ci.takedown) + spec validate process (INV-C8).
6. `channel-interpreter.ts` (hàm thuần) + spec: feed event → assert (pos', state', events) cho từng process; phủ INV-C1..C8.
7. Domain events + base + factory.
8. `ChannelDelivery` entity (giữ processCode+pos+state, gọi interpreter, idempotency) + spec.
9. `Distribution` aggregate + transition + bubble-up + `pullDomainEvents` + spec.
10. Ports (chỉ interface) + policy strategy (4 policy, `resolveProcessCode`) + spec.
11. Guard test `no-framework-import.spec.ts` (đọc mọi file domain, assert không match `@nestjs|typeorm|ssh2|bullmq|xstate`).
12. `npx tsc --noEmit` sạch + `jest src/modules/distribution-orchestration` xanh.

## Todo

- [ ] Cây thư mục + `execution-type.enum.ts`
- [ ] `domain-errors.ts`
- [ ] Value objects (12 VO gồm `TicketRef`+`TicketReason`) + spec
- [ ] Enum: `distribution-state`, `channel-state`, `channel-topology`
- [ ] `delivery-process` type + registry (dữ liệu) + spec validate (INV-C8)
- [ ] `channel-interpreter` (hàm thuần) + spec phủ INV-C1..C8 cho từng process mẫu
- [ ] Domain events (base + distribution + channel) + factory
- [ ] `ChannelDelivery` entity (processCode+pos+state, gọi interpreter, idempotency) + spec
- [ ] `Distribution` aggregate (transition + bubble-up + pullDomainEvents + rehydrate) + spec
- [ ] Ports (9 interface gồm `TicketService`, chỉ chữ ký)
- [ ] `ExecutionPolicy` + 4 policy impl (`resolveProcessCode`; `RetryExecutionPolicy`) + spec
- [ ] Guard test no-framework-import
- [ ] `tsc --noEmit` sạch + jest domain xanh

## Success Criteria

- `tsc --noEmit` sạch cho `distribution-orchestration/domain/`.
- Test: feed sequence event (submit→validate→provision→build→channel done×N) → assert state + event, không mock hạ tầng.
- Invalid transition (INV-D9) bị chặn + không phát event.
- Idempotency (INV-D10 + interpreter): gọi lại transition → no-op.
- `no-framework-import.spec.ts` xanh (NFR2).
- Mọi file < 200 LOC.

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|--------|-----|-----------|
| Over-engineer VO/aggregate (YAGNI) | Trung bình | Chỉ VO/event có transition dùng; cắt cái chưa dùng |
| `ChannelState` phẳng nhầm DIRECT/AGGREGATOR | Trung bình | INV-C5 + helper `assertValidFor(topology, state)`; test theo topology |
| Lệch giá trị enum với v3 → migration vỡ | Cao | `execution-type.enum.ts` copy đúng chuỗi v3; test so khớp |
| Projection user/reviewer/admin lệch state machine | Trung bình | Bảng projection ở §State machine Distribution là nguồn duy nhất; phase 3 impl từ đó |
| Ticket riêng orchestration trùng lặp với `issue`/`release-errors` | Thấp | Có chủ đích tách context; `TicketService` port cô lập, phase 2 quyết bảng riêng |

## Security Considerations

- Domain KHÔNG log giá trị PII/secret (snapshot chứa tên NS/email — domain chỉ giữ `snapshotId`).
- `IdempotencyKey` ở port = chống replay submit (doc §13).
- RBAC admin cho RETRY **không** ở domain — enforce ở application/controller (phase 2/5); domain chỉ có `policy.canRetry()` + ngưỡng.

## Đã chốt trong phiên này (2026-07-13)

- ✅ Vị trí: module mới `src/modules/distribution-orchestration/`, domain thuần ở `domain/`.
- ✅ State 2 tầng: **milestone state + event timeline** (không bê step v3 thành state).
- ✅ `PROVISIONING_IDS` + `BUILDING_PACKAGE` giữ riêng ở machine, projection gộp "Đang chuẩn bị".
- ✅ Lỗi KHÔNG revert DRAFT → dùng `ACTION_REQUIRED` + ticket; `resubmit()` về VALIDATING.
- ✅ State cấp distribution: `DISTRIBUTING`→`DELIVERING`, `AWAITING_REVIEW`→`IN_REVIEW`, bỏ `REJECTED`.
- ✅ State cấp channel: rút còn milestone; `DONE`→`LIVE`; gộp export; DIRECT 1 chờ / VIA_AGGREGATOR 2 chờ.
- ✅ `ChannelType`(DIRECT/CI/STATE51) → `ChannelTopology`(DIRECT/VIA_AGGREGATOR); aggregator/exportMethod là config, không phải type.
- ✅ Upload folder SFTP = import (bỏ bước "submit rồi chờ import"); `WAITING_IMPORT`→`WAITING_INGEST` (chờ aggregator xử lý batch đã import).
- ✅ Tên state `PARTIALLY_DISTRIBUTED` (không `PARTIAL_ISSUES`).

## Chốt bổ sung (2026-07-13, phiên 2)

1. ✅ **TAKEDOWN = mô hình (b)**: `Distribution` MỚI `type=TAKEDOWN`, cùng `releaseId`. Distribution INITIAL giữ `DISTRIBUTED` làm sử liệu. Takedown là execution riêng → DELIVERING (chạy process `{dsp}.takedown`) → TAKEN_DOWN.
2. ✅ **Asymmetry RETRY vs TAKEDOWN — chấp nhận.**
   - TAKEDOWN = **ý định mới** (gỡ nhạc, xảy ra sau, vòng đời/audit riêng) → **aggregate mới**.
   - RETRY = **sửa việc cũ** (execution lỗi vài nhánh, chạy lại đúng nhánh đó) → **mutate aggregate đang tồn tại**; channel đã LIVE giữ nguyên; reset channel ISSUES về stage trước điểm lỗi rồi resume.
   - Không cho RETRY tạo mới để tránh: nhân đôi state channel đã LIVE, mất liên kết lần chạy gốc, phân mảnh audit.
3. ✅ Đổi tên policy `RetryPolicy` → **`RetryExecutionPolicy`** (VO giữ tên `RetryPolicy`).
4. ✅ Ngưỡng poison retry = **3** (mặc định; cấu hình được ở phase 2). Vượt → `RetryLimitExceededError` → chuyển xử lý thủ công.
5. ✅ **Ticket riêng của orchestration** (KHÔNG tái dùng `issue`/`release-errors`). Domain định nghĩa `TicketRef` (VO) + `TicketReason` (enum); entity `OrchestrationTicket` do context này sở hữu, persist ở phase 2. `ChannelIssues`/`ACTION_REQUIRED` phát event kèm `TicketRef` — application tạo ticket qua port `TicketService` (chữ ký ở phase 1).

## Open Questions

*(hết — mọi câu đã chốt; sẵn sàng EXECUTE phase 1)*
5. **Ticket** — dùng lại module `issue` / `release-errors` hiện có làm `ticketRef`, hay khái niệm ticket riêng của orchestration? (nghiêng tái dùng `release-errors`/`issue` — cần xác nhận để định kiểu `ticketRef`).







