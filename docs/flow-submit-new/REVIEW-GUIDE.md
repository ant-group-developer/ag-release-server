# Distribution-v2 — tài liệu review và kiểm tra Phase 01–06

> Cập nhật: 17/09/2026

## 1. Mục đích

Tài liệu này dùng để review lại những phần đã triển khai trong
`ag-release-server`, kiểm tra luồng chạy, đối chiếu quyết định kiến trúc và
phân biệt rõ phần đã làm với phần chưa làm.

Phạm vi hiện tại:

```text
Phase 00 — Architecture decisions
Phase 01 — Foundation/module/schema
Phase 02 — Domain state machine
Phase 03 — Submit/snapshot/review
Phase 04 — UPC/ISRC provisioning
Phase 05 — Package build/shared storage
Phase 06 — Direct DSP SFTP delivery
```

Tài liệu không thay thế các phase spec. Mỗi phase spec vẫn là nguồn chi tiết
chính; file này là checklist và hướng dẫn review xuyên suốt.

---

## 2. Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Module API v2 và worker process riêng | Đã có |
| Schema PostgreSQL `distribution_v2` | Đã có migration Phase 01 |
| Submit/snapshot/review | Đã có |
| UPC/ISRC idempotent provisioning | Đã có |
| Package deterministic/shared volume | Đã có |
| Direct SFTP worker | Đã có |
| CI import/QA | Chưa làm — Phase 07 |
| Batch CI/State51 | Chưa làm — Phase 08 |
| Status sync/retry/takedown | Chưa làm — Phase 09 |
| Read model/metrics | Chưa làm — Phase 10 |
| Rollout/cutover | Chưa làm — Phase 11 |

Các commit gần nhất:

```text
323c06cd feat(distribution-v2): add phase 05 package build and shared storage
84362133 feat(distribution-v2): add phase 06 direct sftp delivery
```

Phase 04 ở `ag-release-server` có commit `b242bc9a`; generator contract additive
ở `ag-isrc-upc-generator-server` có commit `d0c408d`.

Phase 05/06 không tạo migration mới. Các migration cần tồn tại trước khi chạy
đầy đủ là:

```text
1789000000000 — foundation
1789100000000 — submit support
1789200000000 — identifier assignments
```

---

## 3. Sơ đồ kiến trúc cần đối chiếu

```text
HTTP API
  │
  ├─ đọc release qua ReleaseReadPort
  ├─ tạo snapshot immutable
  ├─ tạo distribution + channels
  └─ ghi event + outbox trong cùng transaction
           │
           ▼
PostgreSQL: distribution_v2.outbox_events
           │
           ▼
DistributionV2OutboxRelay
           │
           ▼
Redis/BullMQ: distribution-v2.<queue>
           │
           ├─ provision-id
           ├─ sync-source-id
           ├─ build-package
           └─ sftp-upload
                    │
                    ├─ shared package volume
                    ├─ UPC/ISRC generator
                    ├─ source release/track/video
                    └─ direct DSP SFTP
```

Aggregate state chính:

```text
SUBMITTED
  → VALIDATING
  → WAITING_REVIEW (nếu policy yêu cầu)
  → PROVISIONING_IDS
  → BUILDING_PACKAGE
  → DISTRIBUTING
  → DISTRIBUTED / PARTIALLY_DISTRIBUTED / FAILED
```

Direct channel:

```text
PENDING
  → PROCESSING(SFTP_UPLOAD)
  → WAITING_EXTERNAL(PARTNER)
  → PROCESSING(SYNC)     # Phase 09
  → LIVE | ISSUES
```

Điểm quan trọng: upload SFTP thành công **chưa đồng nghĩa DSP đã LIVE**.
Phase 06 chỉ chuyển channel sang `WAITING_EXTERNAL`; việc poll/normalize trạng
thái DSP thuộc Phase 09.

---

## 4. Thứ tự review code đề nghị

### Bước 1 — Đọc quyết định và scope

Đọc theo thứ tự:

```text
docs/flow-submit-new/PLAN.md
docs/flow-submit-new/00-architecture-decisions.md
docs/flow-submit-new/01-foundation-module-schema.md
...
docs/flow-submit-new/06-direct-sftp-delivery.md
```

Mục tiêu là biết invariant trước khi đọc implementation. Không review code v2
theo giả định của flow legacy.

### Bước 2 — Kiểm tra boundary module

Đọc:

```text
src/app.module.ts
src/modules/distribution-v2/distribution-v2.api.module.ts
src/modules/distribution-v2/distribution-v2.worker.module.ts
src/distribution-v2-worker.main.ts
```

Cần xác nhận:

- `DistributionV2ApiModule` chỉ được đăng ký bổ sung trong API app.
- Worker khởi động bằng entrypoint riêng.
- Worker module không import `distribution-orchestration`,
  `release-executions` hoặc `release-executions3`.
- Worker chỉ tạo queue khi `DISTRIBUTION_V2_ENABLED=true`.
- API process không tạo SFTP/BullMQ worker v2.

### Bước 3 — Kiểm tra persistence boundary

Đọc:

```text
src/migrations/1789000000000-CreateDistributionV2Foundation.ts
src/migrations/1789100000000-CreateDistributionV2SubmitSupport.ts
src/migrations/1789200000000-CreateDistributionV2IdentifierAssignments.ts
src/modules/distribution-v2/entities/
```

Review các điểm:

- Tất cả bảng v2 nằm trong schema `distribution_v2`.
- Không có foreign key tới execution/delivery legacy.
- `outbox_events.job_id` unique.
- `step_runs.idempotency_key` unique.
- Các bảng mutable có `updated_at`.
- `channel_deliveries` giữ `wait_reason`, `scheduled_at`, `external_refs`.

### Bước 4 — Kiểm tra domain thuần

Đọc:

```text
src/modules/distribution-v2/domain/distribution/
src/modules/distribution-v2/domain/channel/
src/modules/distribution-v2/domain/events/
src/modules/distribution-v2/domain/value-objects/
```

Domain không được import:

```text
NestJS
TypeORM
BullMQ
SFTP
gRPC
BucketService2
```

Các câu hỏi review:

1. Transition sai state có bị reject không?
2. Cùng `commandId` có tạo event lần hai không?
3. `WAITING_EXTERNAL` có luôn có `waitReason` và `scheduledAt` không?
4. Channel lỗi có làm reset channel LIVE không?
5. Aggregate có tính đúng `DISTRIBUTED`, `PARTIALLY_DISTRIBUTED`, `FAILED` không?
6. `PACKAGE_BUILT` có chuyển đúng sang `DISTRIBUTING` không?

### Bước 5 — Kiểm tra submit/snapshot

Đọc:

```text
src/modules/distribution-v2/interfaces/controllers/distribution-v2-submit.controller.ts
src/modules/distribution-v2/application/distribution-v2-submit.service.ts
src/modules/distribution-v2/infrastructure/release/release-v2-read.adapter.ts
```

Cần xác nhận transaction submit có thứ tự:

```text
auth/tenant check
→ read release
→ local validation
→ immutable snapshot
→ distribution/channels
→ timeline event
→ outbox
→ commit
→ trả 202
```

HTTP request không được gọi:

```text
generator
SFTP
CI tool
email
```

Kiểm tra riêng:

- Cùng `Idempotency-Key` và cùng request hash trả cùng distribution.
- Cùng key nhưng request hash khác trả `409`.
- User sửa release sau submit không mutate snapshot.
- Active distribution cùng release/DSP bị chặn.
- `UPDATE` và `TAKEDOWN` tạo distribution mới.

### Bước 6 — Kiểm tra identifier provisioning

Đọc:

```text
src/modules/distribution-v2/application/ports/identifier-provisioner.port.ts
src/modules/distribution-v2/application/distribution-v2-provisioning.service.ts
src/modules/distribution-v2/infrastructure/identifier/
```

Đối chiếu generator repo:

```text
ag-isrc-upc-generator-server/src/isrc/isrc.grpc.service.ts
ag-isrc-upc-generator-server/src/identifier-request/
```

Invariant cần giữ:

- `requestId` ổn định theo distribution/release/track/video.
- Retry cùng request ID không cấp mã mới.
- Timeout được lưu `UNKNOWN`, không tự kết luận provider chưa commit.
- `identifier_assignments` là audit assignment v2.
- Source update dùng conditional update (`NULL` hoặc cùng giá trị).
- Chưa sync source xong thì chưa build package.

### Bước 7 — Kiểm tra package builder/store

Đọc:

```text
src/modules/distribution-v2/application/ports/package-builder.port.ts
src/modules/distribution-v2/infrastructure/package/
src/modules/distribution-v2/infrastructure/worker/distribution-v2-build-package.worker.ts
```

Kiểm tra workspace:

```text
{PACKAGE_SHARED_ROOT}/{distributionId}/{attemptNo}/
├── manifest.json
├── {externalId}/{upc}/resources/
├── {externalId}/{upc}/{upc}.xml
├── {externalId}/BatchComplete.xml
└── checksums.json
```

Các câu hỏi:

- Builder có chỉ đọc snapshot không?
- Track/channel có sort deterministic không?
- Resource path có chống traversal không?
- File có được ghi atomic không?
- Retry cùng attempt có đọc lại artifact hoàn tất không?
- Lease có ngăn orphan cleanup xóa workspace đang chạy không?
- `step_runs.output` có lưu artifact pointer không?
- Package worker có ghi `PACKAGE_BUILT` và outbox SFTP trong transaction không?

### Bước 8 — Kiểm tra SFTP

Đọc:

```text
src/modules/distribution-v2/application/ports/sftp-delivery.port.ts
src/modules/distribution-v2/infrastructure/sftp/
src/modules/distribution-v2/infrastructure/worker/distribution-v2-sftp-upload.worker.ts
```

Kiểm tra thứ tự tuyệt đối:

```text
mkdir remote directory
→ XML/message
→ resource
→ BatchComplete.xml
```

Kiểm tra thêm:

- Chỉ channel `DIRECT` được enqueue `sftp-upload`.
- Config được resolve từ active direct routing.
- Password/private key được decrypt trước connect.
- Local package được kiểm tra SHA-256/size trước put.
- Remote file cùng size được reuse.
- Connection/mkdir/stat/put có timeout.
- Bulkhead được tách theo host.
- Lỗi sau attempt cuối tạo `SFTP_UPLOAD_FAILED`.
- Channel khác không bị dừng khi một host lỗi.

---

## 5. Cách chạy kiểm tra tự động

Thực hiện trong `ag-release-server`:

```powershell
npm run build
npx jest src/modules/distribution-v2 --runInBand
npx eslint src/modules/distribution-v2 src/common/config/env.validation.schema.ts
git diff --check
```

Kết quả baseline sau Phase 06:

```text
Build: PASS
Distribution-v2 suites: 8 passed
Distribution-v2 tests: 30 passed
ESLint: PASS
```

Test quan trọng:

```text
src/modules/distribution-v2/domain/distribution-v2.domain.spec.ts
src/modules/distribution-v2/application/distribution-v2-submit.service.spec.ts
src/modules/distribution-v2/infrastructure/package/distribution-v2-package-builder.spec.ts
src/modules/distribution-v2/infrastructure/sftp/distribution-v2-sftp.transport.spec.ts
```

Các test package kiểm tra deterministic build, resume, path traversal, lease,
orphan cleanup và asset thiếu `fileId`.

Các test SFTP kiểm tra XML trước resource, marker cuối và remote file reuse.

---

## 6. Kiểm tra migration và database

Xem trạng thái migration:

```powershell
npm run migration:show
```

Chỉ chạy migration khi môi trường database đã được xác nhận:

```powershell
npm run migration:run
```

Phase 05/06 không cần migration mới.

Các query review đề nghị:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'distribution_v2'
ORDER BY table_name;
```

```sql
SELECT id, release_id, tenant_id, type, status, snapshot_id, version,
       created_at, updated_at
FROM distribution_v2.distributions
ORDER BY created_at DESC
LIMIT 20;
```

```sql
SELECT id, distribution_id, queue_name, job_id, attempts,
       available_at, lease_until, dispatched_at, last_error
FROM distribution_v2.outbox_events
ORDER BY created_at DESC
LIMIT 50;
```

```sql
SELECT id, distribution_id, channel_id, step_type, status,
       attempt_no, idempotency_key, started_at, completed_at, error
FROM distribution_v2.step_runs
ORDER BY created_at DESC
LIMIT 50;
```

```sql
SELECT distribution_id, channel_id, dsp_code, route, status,
       current_stage, wait_reason, scheduled_at, external_refs, last_error
FROM distribution_v2.channel_deliveries
ORDER BY updated_at DESC
LIMIT 50;
```

```sql
SELECT distribution_id, channel_id, event_type, step_id,
       occurred_at, payload
FROM distribution_v2.distribution_events
ORDER BY id DESC
LIMIT 100;
```

Khi review production, không sửa trực tiếp status bằng SQL. Query chỉ dùng để
quan sát; transition phải đi qua worker/domain command.

---

## 7. Kiểm tra Redis/BullMQ và worker

Build trước khi chạy worker:

```powershell
npm run build
npm run start:distribution-v2-worker
```

API chạy riêng:

```powershell
npm run start:dev
```

Environment tối thiểu:

```text
DISTRIBUTION_V2_ENABLED=true
DISTRIBUTION_V2_QUEUE_PREFIX=distribution-v2
DISTRIBUTION_V2_PACKAGE_SHARED_ROOT=<shared-path>
REDIS_HOST=<redis-host>
DB_HOST=<postgres-host>
```

Kiểm tra log worker phải có:

```text
Started distribution-v2.provision-id worker
Started distribution-v2.build-package worker
Started distribution-v2.sftp-upload worker
```

Nếu `DISTRIBUTION_V2_ENABLED=false`, worker phải idle và không consume queue.

Với Redis CLI:

```powershell
redis-cli --scan --pattern "distribution-v2*"
```

Đối chiếu ba lớp idempotency:

```text
outbox_events.job_id
BullMQ jobId
step_runs.idempotency_key
```

Một retry hợp lệ có thể tạo thêm attempt xử lý, nhưng không được tạo side
effect identifier/package/upload trùng ngoài ý muốn.

---

## 8. Kiểm tra shared volume/package

Trên API và worker, giá trị root phải giống nhau:

```powershell
Test-Path $env:DISTRIBUTION_V2_PACKAGE_SHARED_ROOT
Get-ChildItem $env:DISTRIBUTION_V2_PACKAGE_SHARED_ROOT -Recurse
```

Linux/container tương đương:

```bash
test -d "$DISTRIBUTION_V2_PACKAGE_SHARED_ROOT"
find "$DISTRIBUTION_V2_PACKAGE_SHARED_ROOT" -maxdepth 4 -type f
```

Với một artifact hoàn tất, cần thấy:

```text
manifest.json
checksums.json
<externalId>/<upc>/<upc>.xml
<externalId>/<upc>/resources/*
<externalId>/BatchComplete.xml
.lease.json (status COMPLETED)
```

Review `manifest.json`:

- `snapshotId`, `contentHash`, `trackOrderHash` khớp database.
- Channel list khớp `channel_deliveries`.
- File path không bắt đầu bằng `/` và không chứa `..`.
- File size/SHA-256 khớp file thật.

Review `checksums.json`:

- Có message, resource, marker và `manifest.json`.
- Không dùng timestamp làm checksum input.
- Cùng snapshot/attempt tạo cùng nội dung.

---

## 9. Smoke test theo từng lớp

### 9.1 Submit transaction

Gọi endpoint với token test và key mới:

```http
POST /distribution-v2/releases/{releaseId}/submit
Idempotency-Key: review-phase-01-06-001
Content-Type: application/json

{
  "dspCodes": ["SPOTIFY"],
  "needCiImport": false
}
```

Xác nhận:

```text
HTTP 202
distributionId/snapshotId/correlationId được trả về
distributions.status = SUBMITTED
release_snapshots có content_hash/track_order_hash
outbox_events có job START_VALIDATION
```

Gọi lại cùng body/key phải trả cùng distribution. Đổi `dspCodes` nhưng giữ key
phải trả `409`.

### 9.2 Identifier provisioning

Với release thiếu UPC/ISRC:

```text
PROVISIONING_IDS
→ provision-id
→ identifier_assignments
→ external_operations
→ sync-source-id
→ BUILDING_PACKAGE
```

Kiểm tra generator:

- Cùng `requestId` gọi lại trả cùng code.
- Không có row identifier thứ hai cho cùng `(kind, request_id)`.
- Source chỉ được cập nhật nếu đang `NULL` hoặc đúng giá trị assignment.

### 9.3 Package

Dùng fixture snapshot có ít nhất:

```text
1 track + audio asset
1 UPC
1 ISRC
1 direct channel
```

Kiểm tra:

```text
BUILDING_PACKAGE
→ step_runs(BUILD_PACKAGE, DONE)
→ distribution.package_built
→ DISTRIBUTING
→ outbox sftp-upload
```

### 9.4 SFTP sandbox

Không dùng host production cho smoke test. Dùng SFTP sandbox có:

```text
host/user/key riêng
remote base path riêng
quyền mkdir/put/stat
```

Xác nhận remote:

```text
XML xuất hiện trước resource trong log
BatchComplete.xml xuất hiện sau cùng
remote path có externalId/upc
receipt nằm trong channel.external_refs
channel.status = WAITING_EXTERNAL
wait_reason = PARTNER
scheduled_at > now()
```

Chạy lại cùng job:

```text
không tạo file path mới
file cùng size được reuse
không upload marker trước resource
```

---

## 10. Failure test cần thực hiện

| Kịch bản | Kết quả mong đợi |
|---|---|
| Redis tạm mất | Outbox chưa dispatch vẫn còn trong PostgreSQL |
| Worker bị kill khi build package | Job/workspace có thể resume sau lease |
| Asset thiếu `fileId` | Build step fail rõ ràng, không tạo package hợp lệ |
| Local checksum sai | SFTP fail trước `put` file đó |
| SFTP connection timeout | BullMQ retry, step lưu lỗi |
| Put resource lỗi lần 1 | Retry tiếp tục từ cùng remote path |
| Marker đã tồn tại | Chỉ reuse sau khi các file trước đã được xử lý |
| Một host SFTP lỗi | Host khác vẫn được xử lý |
| Retry cùng UPC request ID | Không cấp UPC thứ hai |
| Source identifier đã bị đổi khác | Conditional update fail, không overwrite |
| User edit sau submit | Snapshot cũ không đổi |

Sau failure cuối:

```text
channel.status = ISSUES
issues.code = SFTP_UPLOAD_FAILED
step_runs.status = FAILED
distribution vẫn xử lý channel khác
```

---

## 11. Các điểm cần review kỹ / giới hạn hiện tại

### 11.1 Chưa có validation/orchestration worker v2 đầy đủ

Submit Phase 03 tạo outbox `START_VALIDATION` vào queue `orchestrate`, nhưng
worker hiện tại tập trung vào `provision-id`, `sync-source-id`,
`build-package` và `sftp-upload`. Vì vậy không nên kết luận rằng một POST submit
đã tự động chạy trọn tới SFTP nếu chưa có validation/orchestration handler tương
ứng hoặc test harness chuyển state.

Khi smoke test cần phân biệt:

```text
submit transaction đã pass
≠
full end-to-end release đã pass
```

Đây là hạng mục cần xử lý trước khi canary thực tế.

### 11.2 XML hiện là envelope deterministic v2

Package builder hiện tạo XML envelope ổn định để kiểm tra snapshot/storage/order.
Schema DDEX riêng cho từng DSP cần được adapter hóa/validate trước production
delivery. Không nên coi XML envelope hiện tại là contract cuối cùng của mọi DSP.

### 11.3 Remote checksum

SFTP transport kiểm tra SHA-256/size ở local trước upload và dùng `stat` để
reuse file remote cùng size. SFTP không cung cấp checksum remote chuẩn trong
contract hiện tại; nếu DSP yêu cầu integrity mạnh hơn, cần bổ sung remote hash
hoặc sidecar receipt ở phase tiếp theo.

### 11.4 Read model và metrics chưa có

Trước Phase 10, việc quan sát chủ yếu qua:

```text
distributions
channel_deliveries
step_runs
distribution_events
outbox_events
worker logs
```

Không nên yêu cầu UI dashboard hoàn chỉnh trước khi Phase 10 hoàn tất.

### 11.5 Generator database độc lập

Migration generator phải chạy trong network được phép truy cập MariaDB. Nếu gặp:

```text
Host '<ip>' is not allowed to connect
```

đó là vấn đề whitelist/network, không phải lỗi idempotency contract của
release-server.

---

## 12. Vì sao thiết kế như hiện tại?

| Quyết định | Lý do |
|---|---|
| Schema riêng | Cô lập dữ liệu v2 và rollback độc lập |
| Worker process riêng | Không làm API chậm hoặc load consumer legacy |
| Reducer thuần | Test transition không cần database/external service |
| Snapshot immutable | User edit sau submit không làm thay đổi package đang chạy |
| Outbox | DB state và ý định enqueue không bị lệch khi crash |
| Channel độc lập | DSP lỗi không chặn DSP khác |
| `WAITING_EXTERNAL` + reason | Không phình enum theo từng provider |
| Assignment/request ID riêng | Retry không cấp identifier trùng |
| Shared volume | Worker build và worker delivery nhìn cùng artifact |
| Marker cuối | DSP không đọc package chưa hoàn chỉnh |
| Không mark LIVE sau upload | Upload thành công khác với provider đã ingest/live |

---

## 13. Checklist sign-off

### Code

- [ ] Đọc hết file phase tương ứng.
- [ ] Không có import vào flow legacy.
- [ ] Domain không có framework/external dependency.
- [ ] Idempotency key/job ID deterministic.
- [ ] Error path có timeline/step/issue phù hợp.
- [ ] Không có side effect trong HTTP submit.

### Database

- [ ] Migration đúng môi trường.
- [ ] Schema `distribution_v2` tồn tại.
- [ ] Unique constraints hoạt động.
- [ ] Snapshot không mutate sau submit.
- [ ] Outbox còn row khi Redis unavailable.

### Worker

- [ ] API và worker chạy process riêng.
- [ ] Worker restart không mất job.
- [ ] Queue prefix đúng `distribution-v2`.
- [ ] Shared root giống nhau giữa các process.
- [ ] Retry không tạo side effect trùng.

### Package/SFTP

- [ ] Manifest/checksum deterministic.
- [ ] Path traversal bị chặn.
- [ ] Lease/cleanup hoạt động.
- [ ] XML trước resource, marker cuối.
- [ ] Sai checksum không upload.
- [ ] Host bulkhead/rate limit hoạt động.
- [ ] Lỗi cuối tạo `SFTP_UPLOAD_FAILED`.

### Rollout

- [ ] Chỉ bật feature flag cho tenant/release test.
- [ ] Dùng SFTP sandbox.
- [ ] Có log/correlation ID để truy vết.
- [ ] Có rollback bằng `DISTRIBUTION_V2_ENABLED=false`.
- [ ] Không migrate execution legacy.

---

## 14. Kết luận review

Sau khi checklist trên pass, Phase 01–06 được xem là đạt ở mức foundation,
domain, package và direct transport. Trước khi tuyên bố full release flow sẵn
sàng production cần hoàn tất và review tiếp:

```text
Phase 07 — CI import/QA
Phase 08 — CI/State51 batch export
Phase 09 — status sync/retry/takedown
Phase 10 — read model/observability
Phase 11 — rollout/cutover
```
