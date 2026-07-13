# Phase 3 — Outbox + distribution_event + timeline SSE

**Priority:** Trung bình-cao · **Status:** ⬜ Chưa (skeleton) · **Chi tiết hoá sau**

## Mục tiêu

Reliable messaging (không mất transition) + observability timeline cho UI (SSE).

## Scope (thô)

- Bảng `outbox_event` + relay (poll → publish BullMQ → mark dispatched).
- Bảng `distribution_event` append-only (nguồn timeline + audit).
- Ghi state + event + outbox trong cùng 1 transaction.
- Endpoint `GET /distributions/:id/timeline` (đọc projection) + `GET /distributions/:id/stream` (SSE).
- Read model `release_dsp_delivery` cập nhật từ event (CQRS-lite).

## Entry / Exit

- **Entry:** engine (phase 2) đang phát transition.
- **Exit:** mọi transition ghi event; SSE đẩy realtime; không mất event khi publish lỗi.

## Todo (thô)

- [ ] Migration outbox_event + distribution_event
- [ ] Outbox relay (poll/backoff, tránh double-publish)
- [ ] Transaction gói state + event + outbox
- [ ] SSE gateway forward theo distributionId
- [ ] Timeline API đọc projection
- [ ] Projection release_dsp_delivery từ event

## Câu hỏi mở

- Relay bằng poll đơn giản hay CDC? → poll trước (KISS), CDC khi cần.
