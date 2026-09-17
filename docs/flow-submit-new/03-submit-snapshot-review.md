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

## Trạng thái triển khai

Đã triển khai các thành phần Phase 03:

- `DistributionV2SubmitService` xử lý `INITIAL`, `UPDATE`, `TAKEDOWN`.
- `POST /distribution-v2/releases/:releaseId/submit`
- `POST /distribution-v2/releases/:releaseId/update`
- `POST /distribution-v2/releases/:releaseId/takedown`
- `POST /distribution-v2/distributions/:distributionId/review/approve`
- `POST /distribution-v2/distributions/:distributionId/review/reject`
- `ReleaseV2ReadAdapter` đọc release và asset/reference trong transaction.
- Snapshot immutable gồm metadata, track order, asset manifest, identifier hiện tại,
  DSP selection, source timestamp và SHA-256 hashes.
- Transaction atomic: idempotency record, snapshot, distribution, channels,
  timeline event và outbox cùng commit.
- Idempotency key được scope theo tenant + operation; request khác hash trả `409`.
- Active distribution cùng release/DSP bị chặn; flow cũ và release source không bị cập nhật.
- Review dùng `Distribution` domain reducer và ghi timeline event/outbox tương ứng.

Migration bổ sung:

```text
1789100000000-CreateDistributionV2SubmitSupport
```

Migration Phase 01 đã có trong database. Migration bổ sung này vẫn cần chạy trước
khi gọi endpoint Phase 03.

Test đã chạy:

```text
7 Phase 03 service/migration tests passed
npm run build passed
eslint các file Phase 03 passed
```
