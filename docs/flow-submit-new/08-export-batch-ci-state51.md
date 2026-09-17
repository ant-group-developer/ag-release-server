# Phase 08 — Batch export CI và State51

## Mục tiêu

Gom nhiều release thành batch, hỗ trợ truy vấn hai chiều và retry an toàn.

## Batch key

```text
tenantId + aggregatorCode + batchType + businessDate
```

`batchType`:

```text
CI_EXPORT
STATE51_EMAIL
```

## Flow

```text
CI/QA eligible
→ upsert export_batch
→ insert export_batch_member
→ chờ cutoff theo timezone tenant
→ close batch
→ build Excel
→ submit CI tool hoặc gửi email
→ lưu external reference
```

## CI tool

```text
submit(batchId, requestId, excel)
→ externalJobId
→ poll status
```

`ag-release-tool-export` chỉ automation browser; trạng thái batch thuộc v2.

## State51

```text
send(batchId, requestId, excel)
→ lưu messageId/attachment checksum
→ WAITING_EXTERNAL(GO_LIVE)
```

## Idempotency

- Unique `(batch_id, channel_id)`.
- Unique external operation key.
- CI tool nhận `requestId`/`batchId` additive.
- Retry batch không nhân đôi member/email/job.

## Test/acceptance

- Batch chứa nhiều release.
- Release truy ngược được mọi batch.
- Batch truy ra mọi member/external job.
- Cutoff/timezone chính xác.
- CI tool và email retry độc lập.

