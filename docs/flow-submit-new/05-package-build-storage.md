# Phase 05 — Package build và shared storage

## Mục tiêu

Sinh package deterministic để worker SFTP/CI khác có thể đọc từ shared volume.

## Workspace

```text
{PACKAGE_SHARED_ROOT}/{distributionId}/{attemptNo}/
├── manifest.json
├── {externalId}/
│   ├── {upc}/
│   │   ├── resources/
│   │   └── {upc}.xml
│   └── BatchComplete.xml
└── checksums.json
```

## Quy tắc

- Build chỉ dùng snapshot bất biến, không đọc lại release mutable.
- Không đổi thứ tự audio; track được sort theo `order`, sau đó theo `id`.
- `externalId` ổn định trong cùng `distributionId + attemptNo`.
- Manifest ghi snapshot, channel, file path, size và checksum.
- XML/resource được ghi atomically và kiểm tra checksum.
- Workspace có lease, retention và path traversal protection.

## Port

```typescript
interface PackageBuilder {
  build(input: BuildPackageInput): Promise<PackageArtifact>;
}

interface PackageStore {
  createWorkspace(input: WorkspaceInput): Promise<PackageWorkspace>;
  cleanup(workspaceId: string): Promise<void>;
}
```

## Implementation v2

Phase 05 chạy trong worker process v2 và không thay đổi worker/runner legacy:

- `application/ports/package-builder.port.ts` định nghĩa contract cho builder,
  store và asset reader.
- `infrastructure/package/distribution-v2-package.store.ts` chỉ thao tác dưới
  `DISTRIBUTION_V2_PACKAGE_SHARED_ROOT`. Workspace có dạng
  `{distributionId}/{attemptNo}`, ghi file atomically và có `.lease.json`.
- `infrastructure/package/distribution-v2-package.builder.ts` chỉ đọc
  `ReleaseSnapshotV2.payload` cùng `identifier_assignments`, sắp xếp
  track/channel ổn định, tạo XML envelope v2, resource, `manifest.json` và
  `checksums.json`.
- `infrastructure/worker/distribution-v2-build-package.worker.ts` tiêu thụ
  queue `distribution-v2.build-package`, ghi `step_runs`, chuyển aggregate
  `BUILDING_PACKAGE → DISTRIBUTING` bằng command `PACKAGE_BUILT`, và ghi
  timeline event cùng transaction.

`externalId` hiện được tạo deterministic theo
`{dspCode lowercase}-{distributionId}`. Adapter transport ở phase 06 có thể
dùng giá trị này làm thư mục/định danh ngoài. `packageUri` là workspace id
tương đối, nên worker khác chỉ cần ghép với cùng shared root.

Retry cùng `distributionId + snapshotId + attemptNo` đọc lại
`manifest.json`/`checksums.json` đã hoàn tất. Retry sau step thất bại tạo
`attemptNo` mới và giữ workspace cũ để orphan cleanup xử lý sau khi lease hết
hạn.

## Cấu hình

```text
DISTRIBUTION_V2_PACKAGE_SHARED_ROOT=/var/lib/ag-release/distribution-v2
DISTRIBUTION_V2_PACKAGE_LEASE_MS=900000
DISTRIBUTION_V2_PACKAGE_RETENTION_MS=2592000000
```

## Không làm

- Không lưu package vào disk local không shared.
- Không build lại từ release mutable.
- Không xóa workspace khi còn lease active.
- Không tạo migration hoặc thay đổi bảng execution cũ trong phase này.

## Test/acceptance

- Cùng snapshot tạo cùng manifest/checksum.
- Worker build chết giữa chừng có thể resume từ workspace.
- SFTP worker khác đọc được shared volume.
- Orphan cleanup không xóa workspace đang lease.
- Asset thiếu `fileId` hoặc sai kích thước làm step fail rõ ràng.

Đã có unit test cho deterministic resume, path traversal, active lease và lỗi
asset thiếu `fileId`.
