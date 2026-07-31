# CI Cluster Channel — khử trùng lặp shared-stage cho DSP qua aggregator

## Vấn đề
~20 DSP phát qua CI, mỗi DSP hiện = 1 channel chạy ĐỦ 5 stage `deliver→ingest→qa→export→golive`.
Thực tế (verify trong code): 4/5 stage đầu là SHARED cả cụm (key theo upc/batchId), chỉ `golive`
per-DSP (`StatusSyncRunner` poll `dspCodes:[dspCode]`). Hệ quả với 20 DSP:
- 20× upload cùng package lên cùng SFTP CI
- 20× poll ingest cùng batch
- 20× QA check cùng upc → **20 ticket QA_FLAG cho 1 lỗi** (sai nghiệp vụ)
- 20× export
- 20× go-live poll (đúng — per-DSP)

## Quyết định đã chốt (user 2026-07-25)
- **Hướng A — Cluster channel**: 1 channel cụm chạy `deliver/ingest/qa/export` MỘT LẦN, fan-out per-DSP ở go-live.
- QA/shared fail → **cả cụm ISSUES chung** (1 ticket, mọi DSP hiện 'issues').
- Go-live → **fan-out N watcher** (mỗi DSP 1 entity nhỏ chỉ stage golive, LIVE/ISSUES độc lập).
- Retry → **reset cả cluster** (deliver lại), không retry watcher lẻ.

## Phụ thuộc
Xây trên nền multi-package build (plan 20260725-1530). Nhóm dspRoute=CI ↔ cluster CI là 1:1
(1 package/cụm, 1 cluster channel/cụm). PHẢI hoàn tất + xanh test multi-package trước.

## Thiết kế cluster ↔ watcher

### Process definitions (data, registry)
- `ci.deal.cluster` (mới): `deliver(ACTION) → ingest(WAIT INGEST) → qa(GATE) → export(WAIT EXPORT)`.
  Chạy hết → KHÔNG phải LIVE. Đặt `terminalState = SKIPPED` (cụm shared xong, không tự go-live;
  outcome do watcher quyết). SKIPPED đã có sẵn trong ChannelState + là terminal + bị bỏ qua ở
  resolveDistributionOutcome (chỉ tính LIVE/ISSUES/TAKEN_DOWN).
- `ci.golive` (mới, watcher): `golive(WAIT GO_LIVE)` — 1 stage. Chạy hết → LIVE.
- DIRECT (spotify.initial) giữ nguyên.

### Spawn (ensureChannelsSpawned)
Gom channelSpecs theo dspRoute (dùng lại groupChannelsByRoute):
- DIRECT → 1 channel/DSP như cũ (processCode dsp.initial).
- AGGREGATOR cụm → 1 CLUSTER channel (processCode `{agg}.deal.cluster`), lưu **danh sách dspCode con**.

Entity ChannelDelivery cần biết nó là cluster + giữ `memberDspCodes: string[]`. Watcher spawn SAU
(khi cluster tới cuối), nên cần cơ chế spawn-lần-2 trong aggregate (hiện ensureChannelsSpawned
idempotent chỉ spawn 1 lần).

### Fan-out (điểm mới nhất, rủi ro cao nhất)
Khi cluster channel STEP qua export xong (tới terminal SKIPPED):
- Aggregate phát hiện trong syncChannelOutcome/applyChannelInput → spawn N watcher
  `{clusterId}:golive:{dspCode}` với process `ci.golive`, state PENDING.
- Outbox derive job golive cho từng watcher (per-DSP StatusSyncRunner poll `[dspCode]`).
- resolveDistributionOutcome giờ tính trên: direct channels + watcher channels (cluster SKIPPED bỏ qua).

### Retry (reset cả cluster)
- Nếu cluster ISSUES (deliver/ingest/qa/export fail) → chưa có watcher → reset cluster về `deliver`.
- Nếu watcher ISSUES (1 DSP go-live rejected) → reset **cả cluster** (đã chốt): xoá watcher, reset
  cluster về deliver, re-run shared, re-fan-out. Đơn giản, khớp "cả cụm ISSUES chung".
  (Cân nhắc: hơi phí nếu chỉ 1 DSP fail go-live, nhưng đúng quyết định đã chốt.)

### Projection (release_dsp_delivery) — đổi cách map DSP
Hiện: JOIN `channel_delivery.dsp_code` theo `channel_id` (1 channel = 1 DSP). Cluster phá vỡ giả định.
Cần:
- Cluster channel KHÔNG có 1 dsp_code → phải map ra **N DSP con**. Lưu memberDspCodes vào
  channel_delivery (cột jsonb) hoặc bảng phụ `channel_delivery_member`.
- Event cluster shared-stage (deliver/ingest/qa/export, ChannelIssues) → áp cho **TẤT CẢ member DSP**.
- Event watcher (ChannelLive/ChannelIssues ở golive) → áp cho **đúng 1 DSP** (watcher.dspCode).
- Sửa query projection + detectDrift (đang JOIN cd.dsp_code trực tiếp).

## Các phase đề xuất

### Phase 1 — Domain: cluster + watcher process & entity
- Thêm process `ci.deal.cluster`, `ci.golive` vào registry.
- ChannelDelivery: cờ `isCluster` + `memberDspCodes`; watcher là ChannelDelivery thường (dsp riêng).
- buildProcessCode / groupChannelsByRoute: sinh processCode cluster cho nhóm aggregator.
- Unit test interpreter cho process mới (SKIPPED terminal).

### Phase 2 — Aggregate: spawn cluster + fan-out watcher + outcome
- ensureChannelsSpawned: cụm → 1 cluster channel (giữ memberDspCodes).
- applyChannelInput/syncChannelOutcome: cluster tới SKIPPED → spawn N watcher + event.
- resolveDistributionOutcome: bỏ qua SKIPPED (đã đúng), tính trên direct + watcher.
- resetForRetry: reset cluster = xoá watcher + RESET cluster về deliver.
- Aggregate spec bổ sung: cụm QA fail → FAILED; cụm live → N watcher → outcome.

### Phase 3 — Application: outbox + runner cho cluster/watcher
- buildDeliveringOutbox: cluster sinh 1 job/stage (không nhân theo member); watcher sinh 1 job/DSP.
- QaRunner/CiImportCheckRunner: chạy 1 lần cho cluster (đã theo upc — chỉ cần không nhân bản).
- StatusSyncRunner: watcher poll dspCode riêng (đã đúng).
- ticketIdempotencyKey QA: theo (clusterChannelId, reason, retry) → 1 ticket/cụm.

### Phase 4 — Persistence + projection
- channel_delivery: thêm cột `is_cluster` + `member_dsp_codes jsonb` (migration).
- repo save/load cluster + watcher (watcher spawn động → save khi fan-out).
- projection: map cluster event → N member DSP; watcher event → 1 DSP. Sửa detectDrift.
- Integration test projection cụm.

### Phase 5 — E2E + docs
- orchestrate.e2e: 1 dist (Spotify direct + CI cụm 3 DSP) → 2 build, cluster shared 1 lần, 3 watcher.
- Cập nhật docs/data-flows nếu có.

## Rủi ro
- **Spawn-lần-2 (fan-out)** phá vỡ giả định ensureChannelsSpawned idempotent 1 lần — cần cẩn thận
  không double-spawn khi job redeliver.
- **Projection cluster→N DSP** là thay đổi query lớn, dễ sai ở detectDrift/replay.
- Retry reset cả cluster khi watcher ISSUES → phải xoá watcher sạch (không orphan ở DB/projection).
- Watcher spawn động → repo save/load phải chịu được channel xuất hiện giữa vòng đời (spawnOrder).

## Success criteria
- 1 dist Spotify + 20 DSP CI → 1 cluster channel: 1 upload, 1 ingest poll, 1 QA check, 1 export;
  rồi 20 watcher go-live độc lập.
- QA flagged → 1 ticket, cả 20 DSP hiện 'issues'.
- 1 DSP go-live rejected → DSP đó 'issues', các DSP khác 'distributed' (PARTIALLY_DISTRIBUTED).
- Retry reset cả cluster chạy lại sạch.
- Toàn bộ test cũ xanh.

## Unresolved questions
1. memberDspCodes lưu jsonb trên channel_delivery hay bảng phụ `channel_delivery_member`? (đề xuất
   jsonb cho KISS, bảng phụ nếu cần query/index theo DSP).
2. Khi cluster đang chờ ingest mà 1 member DSP cần takedown lẻ — ngoài scope lần này? (TAKEDOWN cụm
   đã có process ci.takedown riêng).
3. Migration dữ liệu đang chạy dở theo mô hình N-channel cũ → có cần backfill sang cluster không, hay
   chỉ áp cho distribution mới? (v-next chưa prod → đề xuất chỉ áp mới).
