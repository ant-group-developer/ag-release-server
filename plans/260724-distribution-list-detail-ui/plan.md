# Trang List + Detail Phát hành (Distribution v-next) — Server + Client

> Quyết định user (2026-07-24): Status = **DistributionState**; reviewer-flag xây trên **orchestration_ticket**; list qua **endpoint orchestration mới**; phạm vi **server + client**.
> Server ctx: `E:/CODE/ag-release/ag-release-server` · Client ctx: `E:/CODE/ag-release/ag-release-client`

## Phát hiện nền (đã verify)

- List release v3 (`POST /releases/get-list`) đã trả: cover(`coverArtThumbnails`), title, artist(`releaseArtists[]`), label, releaseType(`albumFormat`), UPC, tracksCount, totalDuration, releaseDate, updatedAt, tenant(workspace), **và DSP live/total** (`dspsLiveCount/dspsTotalCount`).
- **Projection orchestration ghi vào chính bảng `release_dsp_delivery`** → DSP live/total đã phản ánh luồng mới. KHÔNG cần build lại.
- Thiếu thật: **DistributionState theo release** (bảng `distribution.state` có, không có HTTP đọc); **ticket list HTTP**; reviewer-flag ghi `items[]` (reject chỉ nhận `note`).
- `ReleaseQueryService` đã được import sẵn vào `distribution-orchestration.module.ts` (dùng cho snapshot) → tái dùng để list, không nhân đôi.
- `orchestration_ticket.metadata` đã chuẩn hoá `{items: TicketIssueItem[]}` (code/message/severity/location/suggestion) — đúng shape flag cần.
- Quan hệ release→distribution là **1:nhiều** (mỗi submit 1 row). List = release-centric, mỗi release gắn **distribution mới nhất**.

---

## PHẦN A — SERVER (module `distribution-orchestration`)

### A1. List endpoint — `GET /distributions`
- **Query service mới** `DistributionListQueryService`:
  - Tái dùng `ReleaseQueryService` lấy trang release + display fields + DSP counts (giữ nguyên logic v3).
  - Batch-load `distribution.state` mới nhất/release: `SELECT DISTINCT ON (release_id) release_id, id, state, type, updated_at FROM distribution WHERE release_id = ANY($1) ORDER BY release_id, created_at DESC`.
  - Merge → mỗi row thêm `{ distributionId|null, distributionState|null, distributionType|null }`.
- Filter: keyword, type(audio/video), `state` (DistributionState), tenant-scope, pagination, order. State-null = chưa submit.
- Controller: thêm vào `DistributionController` (query side) `@Get()` list. RBAC: đọc release.
- Response: `ResponseSuccess<PageDto<DistributionListItem>>`.

### A2. Ticket list — `GET /distributions/:id/tickets`
- `DistributionTicketQueryService.listByDistribution(id)` → rows: `{ id, reason, detail, status, channelId, metadata.items[], context, createdAt, resolvedAt }`.
- Gộp mọi nguồn (reviewer REVIEW_REJECT + QA_FLAG + *_FAIL). Client render `items[]` bằng 1 component.
- RBAC: đọc release, tenant-scope.

### A3. Reviewer-flag (ghi cấu trúc) + resolve
- **Mở rộng `ReviewDecisionDto`**: thêm optional `items: TicketIssueItemDto[]` (validate class-validator lồng).
- `rejectReview` truyền `metadata={items}` vào `ticketService.open(REVIEW_REJECT)` (hiện bỏ trống). Aggregate vẫn → ACTION_REQUIRED + note tóm tắt.
- **Endpoint user đánh dấu đã sửa** `POST /distributions/:id/tickets/:ticketId/resolve`:
  - Wrap `ticketService.resolve()` + guard tenant-scope + status open→resolved.
  - (Không tự resume aggregate — user RESUBMIT riêng; nằm ngoài scope v1.)
- Permissions: tạo flag = `release_review.reject` (reviewer); resolve = release update (user).

### A4. Tests server
- Unit: list query merge state, ticket list mapping, reject-with-items ghi metadata, resolve guard.
- Chạy theo `tester` agent, không mock giả.

---

## PHẦN B — CLIENT (mở rộng module `distribution-orchestration` đã tạo)

### B1. API + types + hooks (bổ sung vào module sẵn có)
- `apis`: `getList(params)`, `getTickets(id)`, `resolveTicket(id, ticketId)`; mở rộng `rejectReview` payload thêm `items[]`.
- `types`: `DistributionListItem`, `DistributionListFilter`, `DistributionTicket`, `TicketIssueItem` (mirror server VO).
- `hooks`: `use-get-distributions` (useQuery, giống `use-get-list-releases`), `use-get-tickets`, `use-resolve-ticket`. (submit/approve/reject/retry/timeline/stream đã có.)
- query-keys: thêm `GET_LIST`, `GET_TICKETS`.

### B2. Trang LIST — `app/[locale]/(cms)/distributions/page.tsx`
- Clone khung `releases/page.tsx`: `AppPageWrapper` + `PageContainer` + `useFilterV2` + `AppPagination`.
- Table columns (theo yêu cầu): cover(`ReleaseCoverImage`), title+artist, label, releaseType(Tag), workspace(tenant.name), UPC, **Status = DistributionState** (tag mới), DSP live/total (`dspsLive`), trackCount, totalDuration(`convertSecondsToHoursMinutes`), releaseDate, updatedAt.
- Component mới: `components/table` + `components/tag/distribution-state-tag.tsx` (map màu từ helper đã có).
- Row click → detail.

### B3. Trang DETAIL — `app/[locale]/(cms)/distributions/[releaseId]/page.tsx`
- Release-centric: load list-item/detail theo releaseId → lấy `distributionId` mới nhất.
- Header: cover + metadata + **nút Submit** (`useSubmitDistribution`; nếu chưa có distribution) / trạng thái.
- **Timeline** (component `DistributionTimeline` đã có) theo distributionId + SSE live.
- **Review actions** (`DistributionReviewActions` đã có): approve/reject(+items)/retry theo state.
- **Flags panel mới** `components/flags-panel`: list ticket (`use-get-tickets`) render `items[]` (severity color, location, suggestion) + nút "Đã sửa" (`use-resolve-ticket`); reviewer thêm flag (form items[] → reject).

### B4. Routing + i18n
- `layouts/cms-layout/routes.tsx`: thêm node `distributions` (icon, permission release read).
- `enums/routes.ts`: `APP_ROUTES.DISTRIBUTIONS`.
- i18n vi+en: cột, nút, state labels (đã có block `distributionOrchestration.state`), flags.

### B5. Verify client
- `npx tsc --noEmit` sạch. Kiểm render list/detail (nếu chạy được dev).

---

## Thứ tự thực thi
1. Server A1 (list) → A2 (tickets) → A3 (flags/resolve) + tests A4.
2. Client B1 (api/hooks) → B2 (list page) → B3 (detail+flags) → B4 (route/i18n) → B5 verify.
3. Docs: cập nhật `plan.md` phase + memory.

## Rủi ro / quyết định
- Tái dùng `ReleaseQueryService` giữ list nhất quán v3, tránh lệch cover/DSP logic.
- `DISTINCT ON` cần index `(release_id, created_at)` trên `distribution` — thêm nếu thiếu (perf).
- Reject-with-items backward-compatible (items optional) → không phá client cũ.
- Detail chọn release-centric (khớp "danh sách bản phát hành"); nếu 1 release nhiều distribution, v1 hiện cái mới nhất — có thể thêm switcher sau.

## Câu hỏi tồn đọng
- Trang detail nên key theo `releaseId` (release-centric, khớp list) hay `distributionId` (1 distribution cụ thể)? Plan đang chọn releaseId.
- "Đã sửa" 1 flag có cần tự động RESUBMIT distribution không, hay user bấm Submit lại thủ công? Plan v1: thủ công (chưa expose RESUBMIT).
