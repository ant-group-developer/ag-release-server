# Phase 09 — Status sync, retry và takedown

## Mục tiêu

Hoàn tất vòng đời channel, retry đúng nhánh và hỗ trợ gỡ phát hành.

## Status sync

```text
WAITING_EXTERNAL
→ delayed job
→ gọi provider/CI
→ normalize response
→ cập nhật channel/event/summary
```

Partner timeout mặc định: 5 ngày, cấu hình được.

Kết quả:

- live/complete → `LIVE`.
- rejected/problem → `ISSUES`.
- chưa có kết quả → schedule poll tiếp.
- timeout → issue `PARTNER_TIMEOUT`.

## Retry API

```http
POST /distribution-v2/distributions/:id/retry
```

Scope:

- Một channel.
- Một step.
- Tất cả channel `ISSUES`.

Channel `LIVE` không reset. Retry tạo attempt mới và giữ audit attempt cũ.

## Takedown

```http
POST /distribution-v2/releases/:releaseId/takedown
```

- Direct DSP: channel từng DSP được chọn.
- CI aggregator: một request/group cho cả cluster.
- Không provision/build package mới.
- Chờ xác nhận rồi chuyển `TAKEN_DOWN`.

## Test/acceptance

- Retry không chạy lại channel thành công.
- Takedown không tạo package.
- Timeout tạo issue và không giữ worker.
- Partial result tổng hợp đúng.
- Admin authorization bắt buộc cho manual retry.

