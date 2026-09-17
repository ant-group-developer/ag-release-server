# Phase 06 — Direct DSP SFTP delivery

## Mục tiêu

Upload direct DSP song song, có giới hạn theo host và retry độc lập.

## Queue

```text
distribution-v2.sftp-upload
```

Payload:

```json
{
  "distributionId": "uuid",
  "attemptId": "uuid",
  "channelId": "uuid",
  "stepId": "uuid",
  "correlationId": "uuid",
  "idempotencyKey": "string"
}
```

## Thứ tự upload

```text
remote directory
→ metadata/XML
→ resources
→ completion marker cuối cùng
```

Marker:

- Spotify: `BatchComplete.xml`.
- CI: `{externalId}.done`.

## Reliability

- `maxAttempts = 3` mặc định.
- Exponential backoff.
- Timeout mỗi file/connection.
- Bulkhead và rate limit theo SFTP host.
- Upload receipt lưu remote path/checksum.

Hết retry:

```text
channel = ISSUES
issue = SFTP_UPLOAD_FAILED
```

DSP khác tiếp tục chạy.

## Test/acceptance

- Marker luôn upload cuối.
- Retry không upload marker sớm.
- Một host lỗi không làm nghẽn queue khác.
- Duplicate job không tạo upload trùng.
- Crash/requeue vẫn reconcile remote state.

