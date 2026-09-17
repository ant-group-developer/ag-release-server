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
→ sync source identifier có conditional update
→ BUILDING_PACKAGE
```

Update không cấp lại identifier.

Nếu source sync lỗi, retry bước sync; không build package trước khi sync hoàn tất.

## Không làm

- Không cấp lại identifier đã có.
- Không sửa execution cũ.
- Không coi timeout là chắc chắn chưa cấp mã.

## Test/acceptance

- Retry cùng key không tạo identifier thứ hai.
- Timeout/reconnect vẫn reconcile được kết quả.
- Conditional source update idempotent.
- Generator cũ không bị phá bởi field mới.

