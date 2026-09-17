# Phase 07 — CI import và QA

## Mục tiêu

Kiểm tra CI import/QA một lần cho mỗi aggregator group trước export.

## CI ingest group

Một distribution/aggregator có một ingest group; nhiều CI/State51 channel tham chiếu group đó.

## Flow

```text
CI upload
→ WAITING_EXTERNAL(CI_IMPORT)
→ delayed poll
→ normalize import result
→ CHECKING_QA
→ export eligible hoặc ACTION_REQUIRED
```

## Import result

Phải lưu:

- Raw response.
- `import_external_identifier`.
- Internal/external batch ID.
- Batch status.
- File-level status.
- Warning/error.
- Poll count và `checked_at`.

Phải xử lý pagination và timeout.

Không dùng duy nhất:

```text
description.length === 1
warnings.length === 0
```

## QA

- Query release format theo GTIN/UPC.
- Lấy đủ trang QA flags.
- Chỉ blocker có `closed_date = null` mới chặn export.
- Lưu issue với raw payload.

## Test/acceptance

- Pending được delayed poll, không giữ worker.
- Import problem tạo issue chính xác.
- QA pagination không bỏ sót blocker.
- Import/QA không chạy lặp theo từng DSP.
- CI API 5xx/rate-limit được retry có backoff.

