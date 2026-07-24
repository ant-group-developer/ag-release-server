# Phase 2 — Chọn DSP khi submit + Xem status từng DSP

> Định hướng user chốt: **ưu tiên module mới `distribution-orchestration`, hạn chế đọc read-model/code v3.**
> Server ctx: `E:/CODE/ag-release/ag-release-server` · Client ctx: `E:/CODE/ag-release/ag-release-client`

## Kết luận nghiên cứu (đã verify)

- **channelSpecs**: client chỉ cần gửi `dspCodes[]`; server resolve `ChannelDeliverySpec[]`. Mọi field trừ `dspCode` derive được server-side:
  - `topology` ← `DspRoutingConfig.mode` (direct→DIRECT; aggregator|system→VIA_AGGREGATOR)
  - `aggregatorCode` ← `routing.aggregator.code`
  - `hasDeal` ← `Dsp.hasDeal`
  - `exportMethod` ← hasDeal → CI_DEAL, else STATE51 (chỉ VIA_AGGREGATOR)
  - `processCode` ← để trống, aggregate tự fill qua `policy.resolveProcessCode(spec)`
- Service dùng: `DspRoutingConfigsService.resolveRawDeliveryConfig(code)` (join dsp+aggregator). `DspRoutingConfigsModule` **đã được orchestration import sẵn**. dsp-routing = config dùng chung (KHÔNG phải pipeline v3) → hợp định hướng.
- **channel_delivery** (orchestration) có state per-channel (PENDING/DELIVERING/WAITING/LIVE/ISSUES/TAKEN_DOWN/SKIPPED) + scheduledAt + ticketRef + dspCode. **Chưa có endpoint đọc** → xây mới.
- Status DSP: đọc `channel_delivery` (orchestration), KHÔNG đọc release_dsp_delivery (v3).

## PHẦN A — SERVER

### A1. Spec resolver (dspCodes → ChannelDeliverySpec[])
- Adapter mới `DspSpecResolver` (application/…): inject `DspRoutingConfigsService`, method `resolveMany(dspCodes: string[]): Promise<ChannelDeliverySpec[]>`.
  - Mỗi code → `resolveRawDeliveryConfig(code)` → map ra spec (topology/aggregatorCode/hasDeal/exportMethod). processCode để trống.
  - DSP không có routing active → 400 (message rõ DSP nào).
- Đặt sau 1 port `DSP_SPEC_RESOLVER` (Symbol) để giữ domain sạch; adapter wrap DspRoutingConfigsService.

### A2. Submit endpoint đổi contract
- `SubmitDistributionDto`: thay `channelSpecs: unknown[]` → **`dspCodes: string[]`** (`@ArrayNotEmpty @IsString each`). (Breaking, nhưng client mới do ta kiểm soát — sửa đồng bộ.)
- `DistributionCommandService.submit`: nhận `dspCodes`, gọi resolver → `channelSpecs` → giữ nguyên phần enqueue.
- Controller truyền `dspCodes` xuống service.

### A3. Channel status endpoint (mới)
- `DistributionChannelQueryService.listByDistribution(id, allowedTenantIds?)` đọc `channel_delivery` theo distributionId (tenant-scope qua bảng `distribution` như ticket service).
- View: `{ channelId, dspCode, topology, state, scheduledAt, ticketRef, retryCount, aggregatorCode }`.
- `GET /distributions/:id/channels` trên DistributionController (tenant-scope, ApiOperation).
- Wire service vào module providers.

### A4. Tests
- Unit resolver: direct→DIRECT, aggregator→VIA_AGGREGATOR+aggregatorCode+exportMethod, DSP thiếu routing→throw.
- Unit channel query: mapping + tenant-scope (mock repo, như ticket-query test).
- Submit service: dspCodes → channelSpecs đúng (mock resolver).

## PHẦN B — CLIENT

### B1. API + types + hooks
- types: `SubmitDistributionPayload.channelSpecs` → **`dspCodes: string[]`**; thêm `DistributionChannel` (channelId/dspCode/topology/state/scheduledAt/ticketRef...).
- apis: sửa `submit` body; thêm `getChannels(id)`.
- hooks: thêm `use-get-channels`; sửa chỗ dùng submit.
- query-keys: `GET_CHANNELS`.

### B2. Modal chọn DSP khi submit
- Component `submit-dsp-modal`: `useGetListDsp({ isActive: true })` (hoặc `/dsps/simple`) → checkbox list (name + topology label từ dspRoutingConfig.mode + CI/State51). Chọn → `dspCodes[]`.
- Nút Submit ở detail mở modal (thay vì submit trực tiếp `[]`). Xác nhận → `submitDistribution({ releaseId, type, dspCodes })`.

### B3. Panel status DSP (channel)
- Component `channels-panel`: `use-get-channels` → bảng: DSP code, topology, **ChannelState tag** (helper màu đã có), scheduledAt (nếu WAITING), có ticket→link/badge.
- Gắn vào trang detail (cột trái hoặc tab cạnh timeline).

### B4. i18n + verify
- i18n vi/en: nút submit modal, cột channel, channelState labels (thêm nếu thiếu).
- `npx tsc --noEmit` sạch cả 2 phía.

## Thứ tự
A1→A2 (submit chạy được với DSP thật) → A3 (status) → A4 test → B1→B2→B3→B4.

## Quyết định user chốt (2026-07-24)

1. **Danh sách DSP**: mặc định lấy **DSP tenant truy cập được** — `GET /tenant-dsp-agreements/tenant/dsps` (client đã có `useGetTenantDsps` → `TenantDspData[]`: dsp.code/name, isActive, mode). Mặc định tích hết DSP active, user bỏ tích DSP không muốn phát hành. (System-tenant: service throw → fallback dùng `GET /dsps?isActive=true` khi là system tenant.)
2. **Status DSP**: đọc `channel_delivery` (module mới) — endpoint `GET /distributions/:id/channels`.
3. **Loại submit**: hỗ trợ **cả INITIAL_RELEASE / UPDATE / TAKEDOWN**. Modal cho chọn type (mặc định suy ra: chưa có distribution → INITIAL_RELEASE; đã DISTRIBUTED → cho UPDATE/TAKEDOWN). Guard state do aggregate/policy lo; client chỉ gửi type + dspCodes.

### Điều chỉnh do quyết định trên
- B2 modal: nguồn DSP = `useGetTenantDsps` (không phải /dsps). TenantDspData.mode cho biết topology label. System-tenant fallback /dsps.
- Submit payload thêm `type` (client cho chọn hoặc suy ra); resolver server dùng dspCodes cho mọi type.
- **exportMethod mode SYSTEM**: theo `hasDeal` như aggregator (hasDeal→CI_DEAL, else STATE51).

### UI (chốt 2026-07-24)
- **ChannelState labels (tạm, chỉnh sau)**: PENDING=Chờ xử lý, DELIVERING=Đang gửi, WAITING=Đang chờ, LIVE=Đã lên sóng, ISSUES=Có lỗi, TAKEN_DOWN=Đã gỡ, SKIPPED=Bỏ qua. Màu: LIVE=success, ISSUES=error, WAITING=warning, DELIVERING=processing, còn lại=default.
- **Layout detail: 2 cột** — trái Timeline (realtime), phải = panel DSP status (channels) TRÊN + flags panel DƯỚI.
- Modal submit: chọn type (INITIAL/UPDATE/TAKEDOWN) + checkbox DSP (tích sẵn active, có "chọn tất cả").
- Channel tag helper: thêm `getChannelStateColor` (đã có sẵn trong helpers) + i18n block `distributionOrchestration.channelState.*`.
