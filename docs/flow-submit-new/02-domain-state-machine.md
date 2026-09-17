# Phase 02 — Domain state machine

## Mục tiêu

Xây dựng domain thuần và kiểm thử transition trước khi nối external system.

## Phạm vi

```text
domain/
  distribution/
  channel/
  events/
  policies/
  value-objects/
```

## Distribution states

```text
SUBMITTED
VALIDATING
WAITING_REVIEW
PROVISIONING_IDS
BUILDING_PACKAGE
DISTRIBUTING
ACTION_REQUIRED
DISTRIBUTED
PARTIALLY_DISTRIBUTED
FAILED
TAKEN_DOWN
```

## Channel states

```text
PENDING
PROCESSING
WAITING_EXTERNAL
WAITING_BATCH
LIVE
ISSUES
TAKEN_DOWN
SKIPPED
```

`WAITING_EXTERNAL` luôn có `waitReason` và `scheduledAt`.

## Transition table

| Hiện tại | Command/event | Điều kiện | Kế tiếp |
|---|---|---|---|
| SUBMITTED | validate | snapshot hợp lệ | PROVISIONING_IDS hoặc WAITING_REVIEW |
| SUBMITTED | validate | có lỗi nghiệp vụ | ACTION_REQUIRED |
| WAITING_REVIEW | approve | reviewer hợp lệ | PROVISIONING_IDS |
| WAITING_REVIEW | reject | note bắt buộc | ACTION_REQUIRED |
| PROVISIONING_IDS | ids_ready | tất cả assignment xong | BUILDING_PACKAGE |
| BUILDING_PACKAGE | package_ready | manifest/checksum hợp lệ | DISTRIBUTING |
| DISTRIBUTING | channel update | channel chưa terminal | DISTRIBUTING |
| DISTRIBUTING | all live | tất cả channel LIVE | DISTRIBUTED |
| DISTRIBUTING | mixed | LIVE + ISSUES | PARTIALLY_DISTRIBUTED |
| DISTRIBUTING | all issues | không có LIVE | FAILED |
| ACTION_REQUIRED | resubmit | snapshot mới | SUBMITTED |

## Channel process

### Direct

```text
PENDING → PROCESSING(upload)
→ WAITING_EXTERNAL(PARTNER)
→ PROCESSING(sync)
→ LIVE | ISSUES
```

### CI

```text
PENDING → PROCESSING(upload)
→ WAITING_EXTERNAL(CI_IMPORT)
→ PROCESSING(QA)
→ WAITING_BATCH
→ WAITING_EXTERNAL(GO_LIVE)
→ LIVE | ISSUES
```

### Takedown

```text
PENDING → PROCESSING(request)
→ WAITING_EXTERNAL(TAKEDOWN)
→ TAKEN_DOWN | ISSUES
```

## Không làm

- Không import NestJS/TypeORM/BullMQ/gRPC/SFTP.
- Không gọi external adapter.
- Không cập nhật release source.

## Test

- Mọi transition hợp lệ.
- Mọi transition sai state bị reject.
- Idempotent command.
- Partial/failed aggregation.
- Retry reset channel ISSUES nhưng giữ channel LIVE.
- Takedown không đi qua provision/build.

## Acceptance

Domain test chạy không cần database/Redis/external service.

## Trạng thái triển khai

Đã triển khai trong `src/modules/distribution-v2/domain/`:

- `Distribution` aggregate và reducer thuần.
- `ChannelDelivery` và reducer trạng thái channel.
- `DistributionPolicy`, `RetryPolicy` và domain error.
- Domain event contract với event id deterministic.
- Idempotency ở aggregate và channel qua `lastCommandId`.
- `WAITING_EXTERNAL` bắt buộc `waitReason` và `scheduledAt` hợp lệ.
- `RESUBMIT` tạo lại snapshot/channel state từ `ACTION_REQUIRED`.

Test:

```text
13 domain/foundation tests passed
npm run build passed
eslint src/modules/distribution-v2/domain passed
```
