# Phase 06 — Direct DSP SFTP delivery

## Mục tiêu

Upload các direct DSP song song, có bulkhead theo host, timeout, retry hữu hạn
và không phát completion marker trước các file nội dung.

## Queue và payload

```text
distribution-v2.sftp-upload
```

Payload được tạo trong cùng transaction với `PACKAGE_BUILT`:

```json
{
  "distributionId": "uuid",
  "stepId": "uuid",
  "channelId": "uuid",
  "attemptId": "uuid",
  "packageStepId": "uuid",
  "packageUri": "distributionId/1",
  "externalId": "spotify-distributionId",
  "attemptNo": 1,
  "correlationId": "uuid",
  "idempotencyKey": "distribution-v2:sftp-upload:...",
  "command": "UPLOAD_DIRECT_SFTP"
}
```

Chỉ channel có `route = DIRECT` được enqueue. CI/State51 channel để phase sau.

## Thứ tự upload

```text
remote directory
→ metadata/XML
→ resources
→ BatchComplete.xml
```

Transport đọc file từ shared package root, kiểm tra size/SHA-256 trước khi
upload. Nếu remote file đã tồn tại cùng size thì đánh dấu `reused`; nếu thiếu
hoặc sai size thì upload lại cùng remote path. Completion marker luôn là file
cuối cùng trong thứ tự.

## Reliability

- Mỗi host có semaphore bulkhead (`DISTRIBUTION_V2_SFTP_PER_HOST_CONCURRENCY`).
- Có rate limit giữa các job cùng host.
- Connection, mkdir, stat và put đều có timeout.
- BullMQ retry tối đa 3 lần mặc định; step lưu từng attempt/lỗi.
- Crash/requeue an toàn vì remote path deterministic và upload có reconcile.
- Receipt lưu remote path, size, checksum và cờ `reused` trong
  `channel_deliveries.external_refs` và `step_runs.output`.

## State transition

Upload bắt đầu:

```text
PENDING → PROCESSING(SFTP_UPLOAD)
```

Upload thành công:

```text
PROCESSING
→ WAITING_EXTERNAL(waitReason=PARTNER, scheduledAt=now+partnerTimeout)
```

Phase 09 sẽ poll trạng thái DSP và chuyển tiếp `LIVE` hoặc `ISSUES`.

Sau lần retry cuối:

```text
channel = ISSUES
issue.code = SFTP_UPLOAD_FAILED
```

Các channel khác của distribution vẫn tiếp tục độc lập.

## Cấu hình

```text
DISTRIBUTION_V2_SFTP_PER_HOST_CONCURRENCY=2
DISTRIBUTION_V2_SFTP_RATE_LIMIT_MS=0
DISTRIBUTION_V2_SFTP_TIMEOUT_MS=300000
DISTRIBUTION_V2_SFTP_MAX_ATTEMPTS=3
DISTRIBUTION_V2_PARTNER_TIMEOUT_MS=432000000
```

Resolver đọc direct routing từ `dsp_routing_configs` và giải mã password/private
key qua cơ chế hiện tại. Không import consumer/cron legacy vào worker v2.

## Không làm

- Không upload CI/State51 trong phase này.
- Không gọi SFTP trong HTTP request.
- Không thay đổi `distribution-orchestration` hoặc queue legacy.
- Không đánh dấu channel `LIVE` chỉ vì upload thành công; cần status sync ở phase 09.

## Test/acceptance

- Marker luôn upload cuối.
- Retry không upload marker sớm.
- Duplicate job dùng lại remote file cùng size.
- Sai checksum local làm job fail trước khi upload file đó.
- Một host lỗi không chặn host khác nhờ bulkhead.
- Một DSP lỗi không chặn channel khác.
