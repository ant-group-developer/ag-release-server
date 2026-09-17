# Phase 11 — Rollout và cutover

## Mục tiêu

Đưa v2 vào production theo canary, có rollback không ảnh hưởng flow cũ.

## Feature flags

```text
DISTRIBUTION_V2_ENABLED
DISTRIBUTION_V2_TENANT_ALLOWLIST
DISTRIBUTION_V2_RELEASE_ALLOWLIST
```

## Trình tự

1. Chạy migration schema v2.
2. Deploy API module.
3. Deploy `distribution-v2-worker` riêng.
4. Kiểm tra health/queue/outbox.
5. Bật một tenant/release thử nghiệm.
6. Nghiệm thu Initial.
7. Nghiệm thu Update/Takedown/Retry.
8. Mở rộng canary.
9. Theo dõi metrics và lỗi external.
10. Mở rộng traffic.

## Rollback

- Tắt feature flag.
- Không xóa bảng hoặc event v2.
- Job đang chạy được pause/reconcile theo runbook.
- Flow cũ tiếp tục hoạt động.

## Không làm

- Không migrate execution cũ ở giai đoạn đầu.
- Không thay endpoint cũ.
- Không chuyển toàn bộ traffic khi chưa đạt acceptance.

## Monitoring

Theo dõi:

- API latency/error.
- Queue depth và oldest job age.
- Outbox pending/failed.
- SFTP retry/failure.
- CI import/QA problem.
- Batch send success/failure.
- Partner timeout.
- Workspace disk usage.

## Acceptance cuối

- 100 release/ngày không làm nghẽn API.
- Worker restart không mất job.
- Retry không tạo side effect trùng.
- Một channel lỗi không chặn channel khác.
- Tra cứu/timeline đầy đủ.
- Rollback chỉ bằng flag.
- Flow cũ không đổi hành vi.

