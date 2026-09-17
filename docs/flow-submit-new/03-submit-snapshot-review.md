# Phase 03 — Submit, snapshot và review

## Mục tiêu

Đưa release vào v2 an toàn, nhanh và có snapshot bất biến.

## API

```http
POST /distribution-v2/releases/:releaseId/submit
POST /distribution-v2/releases/:releaseId/update
POST /distribution-v2/releases/:releaseId/takedown
```

Request:

```json
{
  "dspCodes": ["SPOTIFY", "ANGHAMI"],
  "needCiImport": true
}
```

Bắt buộc:

```http
Idempotency-Key: <unique-value>
```

Response: `202 Accepted`.

## Submit transaction

```text
auth/tenant check
→ load release bằng ReleaseReadPort
→ validate tối thiểu
→ create release_snapshot
→ create distribution/channels
→ insert distribution event
→ insert outbox command
→ commit
→ trả distributionId/correlationId
```

Request không gọi external I/O.

## Snapshot

Lưu:

- Metadata release.
- Track order.
- Audio/cover/video references.
- UPC/ISRC hiện tại.
- DSP selection.
- Tenant policy.
- Source timestamp/version.
- Content hash và track order hash.

## Review

```text
VALIDATING
  → WAITING_REVIEW nếu tenant.requires_manual_review = true
  → approve → PROVISIONING_IDS
  → reject → ACTION_REQUIRED
```

User sửa dữ liệu phải tạo snapshot/distribution mới; snapshot cũ không mutate.

## Không làm

- Không gọi SFTP, CI, generator, email.
- Không cập nhật release status cũ.
- Không hủy execution cũ.

## Test/acceptance

- Duplicate idempotency trả cùng kết quả.
- Submit không bị block bởi external service.
- Snapshot không đổi sau source edit.
- Active distribution cùng release/DSP trả `409`.
- Review approve/reject có timeline event.

