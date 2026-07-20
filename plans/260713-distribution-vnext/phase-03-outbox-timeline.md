# Phase 3 — Timeline read-side + SSE (projection từ distribution_event)

**Priority:** Trung bình-cao · **Status:** 🔵 Đang thực hiện — Step 2 XONG · **Chi tiết: `phase-03-outbox-timeline-detailed.md`**
**Depends on:** Phase 2 (đã có `distribution_event` + `outbox_event` + relay ở write-side)

## Ranh giới với Phase 2 (đã chốt 2026-07-16)

Phase 2 đã làm **write-side**: bảng `distribution_event` + `outbox_event`, relay polling, và transaction gói `state + channels + events + outbox`. **Phase 3 KHÔNG làm lại phần đó** — Phase 3 là **read-side** (CQRS-lite): đọc event đã ghi → chiếu ra timeline cho UI.

## Mục tiêu

Observability cho người dùng: dev + kiểm duyệt viên + user theo dõi tiến độ realtime của từng release, từng bước — đọc từ `distribution_event` (nguồn Phase 2 đã ghi).

## Scope

- **Timeline API** `GET /distributions/:id/timeline` — đọc `distribution_event` (lọc theo `level`: user thấy milestone, admin/dev thấy cả progress).
- **SSE stream** `GET /distributions/:id/stream` — server đẩy 1 chiều mỗi event mới. Nguồn đẩy: relay/event bus bắn ra → gateway SSE forward theo `distributionId`.
- **Projection `release_dsp_delivery`** (read model) — cập nhật từ event, cho màn hình user hiện có. Đúng tinh thần CQRS-lite: read model tách khỏi write aggregate.
- Không WebSocket (đã chốt SSE): luồng chỉ cần server → client 1 chiều.

## Entry / Exit

- **Entry:** Phase 2 đang ghi `distribution_event` mỗi transition + relay chạy.
- **Exit:** UI thấy timeline realtime ("Đang upload Spotify... Chờ CI import... Đã phân phối 2/2"); `release_dsp_delivery` khớp trạng thái channel.

## Todo (thô)

- [ ] Query service đọc `distribution_event` → timeline DTO (nhóm theo channel, lọc theo level)
- [ ] Timeline API endpoint
- [ ] SSE gateway forward theo distributionId (nguồn: event bus/relay)
- [ ] Projection handler: event → upsert `release_dsp_delivery`
- [ ] Kiểm tra `release_dsp_delivery` v3 cũ — tái dùng hay tạo mới

## Câu hỏi mở

- Nguồn đẩy SSE: relay bắn thêm event nội bộ (in-process EventEmitter) hay đọc lại từ DB? → nghiêng EventEmitter in-process cho đơn giản, fallback poll DB.
- `release_dsp_delivery` đã tồn tại từ v3 (read model hiện tại) — map trực tiếp hay thêm cột? → khảo sát khi tới.
