# Phase 00 — Architecture decisions

## Mục tiêu

Chốt các quyết định nền để các phase sau không tự chọn lại kiến trúc.

## Phạm vi

- Boundary module.
- Ownership dữ liệu.
- State machine.
- Queue/outbox.
- Snapshot.
- Retry/idempotency.
- Quy tắc chờ.

## Không làm

- Không tạo entity hoặc migration.
- Không đăng ký module vào `AppModule`.
- Không thay đổi flow cũ.
- Không triển khai adapter external.

## Quyết định

### Boundary

```text
distribution-v2
  ├── API module
  ├── worker module
  ├── domain/application
  └── infrastructure adapters
```

V2 không import `release-executions3`, `release-executions` hoặc
`distribution-orchestration`.

### Database

- Dùng PostgreSQL hiện tại nhưng schema `distribution_v2`.
- Không foreign key tới execution/delivery cũ.
- `release_id`, `dsp_id` là reference value.

### Queue

- Dùng BullMQ.
- Prefix `distribution-v2`.
- Mỗi loại side effect có queue riêng.
- Outbox v2 có `job_id` unique và lease.

### Worker

- API process và worker process độc lập.
- Worker v2 không load cron/consumer cũ.
- State không được giữ trong RAM giữa các job.

### Domain

- Reducer thuần, không phụ thuộc framework.
- Distribution là aggregate root.
- Channel là đơn vị delivery/retry độc lập.
- Event append-only phục vụ audit/timeline.

### Snapshot

Snapshot bất biến tạo lúc submit, gồm metadata, asset reference, identifier,
Dsp selection, tenant policy và source hash.

### Trạng thái chờ

Không dùng `sleep`.

```text
WAITING_EXTERNAL
  wait_reason = PARTNER | CI_IMPORT | EXPORT | GO_LIVE | TAKEDOWN
  scheduled_at = thời điểm chạy lại
```

`WAITING_ACTION` chỉ dành cho review/admin/user.

### Idempotency

Mỗi command/job có:

```text
correlation_id
idempotency_key
attempt_id
```

External operation có unique key riêng. Timeout không được mặc định coi là
thất bại nếu chưa biết external side effect đã xảy ra hay chưa.

## Event naming

```text
distribution.submitted
distribution.validated
distribution.review_requested
distribution.review_approved
distribution.review_rejected
distribution.ids_provisioned
distribution.package_built
channel.upload_succeeded
channel.upload_failed
channel.waiting_external
channel.import_checked
channel.qa_passed
channel.qa_failed
channel.export_queued
channel.live
channel.issue_opened
distribution.completed
distribution.retry_requested
```

## Acceptance

- Có bảng state/transition trong Phase 02.
- Có quy ước event/idempotency.
- Không còn quyết định kiến trúc mở ảnh hưởng đến Phase 01.

