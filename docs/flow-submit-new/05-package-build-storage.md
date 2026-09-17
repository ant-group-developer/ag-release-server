# Phase 05 — Package build và shared storage

## Mục tiêu

Sinh package deterministic, worker nào cũng có thể đọc và upload.

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

- Build chỉ dùng snapshot.
- Không đổi audio order.
- `externalId` ổn định trong attempt.
- Manifest ghi release, attempt, file path, size, checksum.
- XML/resource upload được kiểm tra checksum.
- Workspace có lease và retention.

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

## Không làm

- Không lưu package vào disk local không shared.
- Không build lại từ release mutable.
- Không xóa workspace khi còn channel active.

## Test/acceptance

- Cùng snapshot tạo cùng manifest/checksum.
- Worker build chết có thể resume/cleanup.
- SFTP worker khác đọc được workspace.
- Orphan cleanup không xóa workspace đang lease.

