# Distribution-v2 — kế hoạch triển khai theo phase

Ngày chốt kế hoạch: **2026-09-17**

## Mục tiêu

Xây dựng luồng phát hành mới trong `ag-release-server`, chạy song song và độc lập với flow cũ.

Không thay đổi logic, queue, cron, bảng dữ liệu hoặc endpoint của:

- `release-executions3`
- `release-executions`
- `distribution-orchestration`
- các endpoint submit hiện tại

## Quy ước đã chốt

- Module mới: `src/modules/distribution-v2/`.
- PostgreSQL schema mới: `distribution_v2`.
- Queue BullMQ prefix mới: `distribution-v2`.
- Worker v2 là process riêng trong cùng repository.
- State machine dùng reducer thuần.
- State bền nằm trong PostgreSQL.
- Outbox đảm bảo DB state và ý định enqueue được ghi atomic.
- Package dùng shared volume v2.
- Direct DSP là channel độc lập.
- CI import/QA là pipeline chung theo aggregator.
- CI export và State51 email được gom batch.
- Review theo tenant, trước provision UPC/ISRC.
- Update tạo distribution mới, chạy lại nhánh cần thiết nhưng không cấp lại identifier.
- Takedown tạo distribution mới.
- Retry tạo attempt mới cho channel/step lỗi.
- Chờ đối tác dùng `WAITING_EXTERNAL + wait_reason + scheduled_at`.

## Dependency graph

```text
00 Decisions
    ↓
01 Foundation/schema
    ↓
02 Domain state machine
    ↓
03 Submit/snapshot/review
    ↓
04 Identifier provisioning
    ↓
05 Package build/storage
    ↓
06 Direct SFTP
    ↓
07 CI import/QA
    ↓
08 CI/State51 batch export
    ↓
09 Status sync/retry/takedown
    ↓
10 Read model/observability
    ↓
11 Rollout/cutover
```

## Trạng thái phase

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 00 | Architecture decisions | ✅ Tài liệu |
| 01 | Module, worker, schema | 🟡 Migration đã apply; integration DB test còn pending |
| 02 | Domain state machine | ✅ Code hoàn tất; domain test/build/lint xanh |
| 03 | Submit, snapshot, review | 🟡 Code hoàn tất; chờ chạy migration 1789100000000 |
| 04 | UPC/ISRC provisioning | ⬜ Chưa triển khai |
| 05 | Package build/storage | ⬜ Chưa triển khai |
| 06 | Direct DSP SFTP | ⬜ Chưa triển khai |
| 07 | CI import/QA | ⬜ Chưa triển khai |
| 08 | Batch export CI/State51 | ⬜ Chưa triển khai |
| 09 | Status sync/retry/takedown | ⬜ Chưa triển khai |
| 10 | Read model/observability | ⬜ Chưa triển khai |
| 11 | Rollout/cutover | ⬜ Chưa triển khai |

## Cách thực hiện

Mỗi phase phải:

1. Đọc tài liệu phase.
2. Thực hiện đúng phạm vi.
3. Chạy unit/integration test của phase.
4. Kiểm tra không chạm flow cũ.
5. Cập nhật trạng thái phase trong file này.
6. Chỉ sau khi nghiệm thu mới bắt đầu phase kế tiếp.

## Acceptance tổng thể

- Submit HTTP không chờ SFTP, CI, gRPC hoặc email.
- Snapshot sau submit không bị thay đổi bởi user edit.
- Worker restart không làm mất job.
- Retry không tạo side effect trùng.
- Một DSP lỗi không chặn DSP khác.
- CI import/QA chỉ chạy một lần cho mỗi ingest group.
- Tra cứu hai chiều release ↔ batch ↔ external job.
- Có timeline và progress cho UI.
- 100 release/ngày không làm nghẽn API.
- Flow cũ không thay đổi hành vi.

## Tài liệu phase

- [00-architecture-decisions.md](00-architecture-decisions.md)
- [01-foundation-module-schema.md](01-foundation-module-schema.md)
- [02-domain-state-machine.md](02-domain-state-machine.md)
- [03-submit-snapshot-review.md](03-submit-snapshot-review.md)
- [04-identifier-provisioning.md](04-identifier-provisioning.md)
- [05-package-build-storage.md](05-package-build-storage.md)
- [06-direct-sftp-delivery.md](06-direct-sftp-delivery.md)
- [07-ci-import-qa.md](07-ci-import-qa.md)
- [08-export-batch-ci-state51.md](08-export-batch-ci-state51.md)
- [09-status-sync-retry-takedown.md](09-status-sync-retry-takedown.md)
- [10-read-model-observability.md](10-read-model-observability.md)
- [11-rollout-cutover.md](11-rollout-cutover.md)
