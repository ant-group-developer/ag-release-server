# Phase 01 — Module, worker và database schema

## Mục tiêu

Tạo khung module/worker và schema dữ liệu v2 mà không bật nghiệp vụ.

## Phạm vi

Tạo:

```text
src/modules/distribution-v2/
  distribution-v2.api.module.ts
  distribution-v2.worker.module.ts
  distribution-v2-worker.main.ts
```

Đăng ký API module bổ sung trong `AppModule`.

## Không làm

- Không thay đổi service/controller cũ.
- Không đọc/ghi `release_execution*`.
- Không chạy worker trong API process.
- Chưa gọi SFTP/CI/generator.

## Schema

Tạo schema `distribution_v2` và các bảng:

```text
distributions
release_snapshots
channel_deliveries
step_runs
distribution_events
outbox_events
external_operations
export_batches
export_batch_members
issues
distribution_summary
```

Mọi bảng có `created_at`, bảng mutable có `updated_at`.

Outbox bắt buộc có:

```text
job_id unique
available_at
lease_until
attempts
dispatched_at
last_error
```

## Config

```text
DISTRIBUTION_V2_ENABLED=false
DISTRIBUTION_V2_QUEUE_PREFIX=distribution-v2
DISTRIBUTION_V2_PACKAGE_SHARED_ROOT=/var/lib/ag-release/distribution-v2
DISTRIBUTION_V2_WORKER_CONCURRENCY=4
```

## Test

- Migration up/down trên PostgreSQL.
- Schema tồn tại sau migration.
- Unique outbox job id.
- API module bootstrap.
- Worker application context bootstrap.
- API bootstrap không tạo worker queue.

## Acceptance

- Migration chỉ tạo object trong schema v2.
- `npm run build` thành công.
- API và worker khởi động độc lập.
- Không có file flow cũ bị sửa.

## Điều kiện phase kế tiếp

Entity/repository/transaction boundary dùng được cho domain reducer và outbox.

