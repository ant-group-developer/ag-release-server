# Phase 04 — UPC/ISRC provisioning

## Mục tiêu

Cấp identifier có retry an toàn và lưu assignment/audit riêng.

## Port

```typescript
interface IdentifierProvisioner {
  provisionUpc(input: ProvisionUpcInput): Promise<ProvisionedIdentifier>;
  provisionIsrc(input: ProvisionIsrcInput): Promise<ProvisionedIdentifier>;
}
```

Input bắt buộc:

```text
requestId
consumer = distribution-v2
releaseId hoặc trackId
idempotencyKey
```

## Generator contract additive

Thêm field không phá client cũ:

```text
GetUpcRequest.requestId
GetUpcRequest.releaseId
CreateIsrcRequest.requestId
CreateIsrcRequest.trackId
```

Cùng request ID phải trả assignment cũ.

## Flow

```text
PROVISIONING_IDS
→ provision missing UPC/ISRC
→ lưu external_operation + assignment v2
→ enqueue `sync-source-id`
→ sync source identifier có conditional update
→ BUILDING_PACKAGE
```

Update không cấp lại identifier.

Nếu source sync lỗi, retry bước sync; không build package trước khi sync hoàn tất.

## Triển khai Phase 04

Release server bổ sung:

- `IdentifierProvisioner` ACL port và gRPC adapter dùng `UpcService`/`IsrcService`.
- `DistributionV2ProvisioningService` xử lý job `provision-id`.
- `DistributionV2ProvisionIdWorker` chạy trong process worker riêng.
- `DistributionV2OutboxRelay` chỉ đọc `distribution_v2.outbox_events`.
- Bảng `distribution_v2.identifier_assignments` để audit assignment theo
  `kind + request_id`.
- `external_operations` lưu trạng thái PENDING/SUCCEEDED/UNKNOWN và response
  generator.

Request id ổn định theo distribution:

```text
distribution-v2:{distributionId}:release:{releaseId}:upc
distribution-v2:{distributionId}:audio:{trackId}:isrc
distribution-v2:{distributionId}:video:{videoId}:isrc
```

Worker chỉ chuyển aggregate sang `BUILDING_PACKAGE` sau khi:

1. Tất cả identifier thiếu đã được cấp hoặc reconcile từ assignment.
2. Release/track/video đã được cập nhật bằng conditional update
   (`NULL` hoặc cùng giá trị).
3. Event `distribution.ids_provisioned`,
   `distribution.source_identifiers_synced` và outbox `build-package` đã được
   ghi trong cùng transaction.

`sync-source-id` là queue riêng. Vì vậy lỗi PostgreSQL/source update chỉ retry
bước đồng bộ, không gọi generator lần nữa.

Generator server có contract additive:

- `GetUpcRequest.requestId`, `GetUpcRequest.releaseId`.
- `CreateIsrcRequest.requestId`, `CreateIsrcRequest.trackId`.
- Bảng `identifier_generation_requests` lưu kết quả theo request id.
- Request cũ không có `requestId` tiếp tục đi qua logic cũ.

## Không làm

- Không cấp lại identifier đã có.
- Không sửa execution cũ.
- Không coi timeout là chắc chắn chưa cấp mã.

## Test/acceptance

- Retry cùng key không tạo identifier thứ hai.
- Timeout/reconnect vẫn reconcile được kết quả.
- Conditional source update idempotent.
- Generator cũ không bị phá bởi field mới.
