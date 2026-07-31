# Multi-Package Build per dspRoute

## Bối cảnh
Hiện `BuildPackageRunner` build **1 package duy nhất** từ `channelSpecs[0]` → set `dist.packageUri` (1 string cấp distribution). Mọi channel SFTP đọc chung `dist.packageUri`. SAI khi 1 release có nhiều đích khác ernVersion/sender/SFTP (Spotify direct ERN 4.3 vs CI aggregator ERN 3.8.2).

Mục tiêu: build **N package theo nhóm dspRoute** (Spotify + CI = 2 bản), mỗi channel upload đúng package của nhóm mình.

## Quyết định đã chốt (user 2026-07-25)
- Khóa gom nhóm = **dspRoute** (DIRECT → theo dspCode; AGGREGATOR → theo aggregatorCode). Dùng lại `parseProcessCode`.
- Nhóm CI dùng **1 XML chung, recipient = CI** (aggregator party), sender = AMG.

## Rủi ro cốt lõi phát hiện khi khảo sát
1. **Build aggregator hiện hỏng:** builder gọi `resolveFullDeliveryConfig(dspRoute='CI')` nhưng hàm query `dsp.code='CI'` → NOT_FOUND. Cần nhánh resolve theo aggregator.
2. **Recipient mismatch:** `resolveFullDeliveryConfig` mode AGGREGATOR đang trả sender=CI, recipient=DSP — ngược với "recipient=CI" user muốn. Cần method resolve aggregator: sender=AMG, recipient=aggregator ddexId.
3. `packageUri` là **1 cột text** ở nhiều lớp (command, aggregate `_packageUri`, event, ORM, in-memory repo, SftpUploadRunner). Đổi sang map = thay đổi xuyên suốt + migration DB.

## Kiến trúc thay đổi

### Nhóm hóa (application)
- Thêm helper `groupChannelsByRoute(specs, policy)`: với mỗi spec → resolve processCode → `parseProcessCode().dspRoute` = groupKey. Trả `Map<groupKey, { processCode đại diện, dspCodes: string[] }>`.
- `dspRoute` đại diện: DIRECT = dspCode viết hoa; AGGREGATOR = aggregatorCode viết hoa (CI).

### packageUri: string → Record<groupKey, uri>
- `MarkPackageBuiltCommand.packageUri: string` → `packageUris: Record<string,string>`.
- Aggregate: `_packageUri?: string` → `_packageUris: Record<string,string>`; getter `packageUriFor(groupKey)`; `markPackageBuilt(packageUris, ...)` set map, guard non-empty.
- Event `PackageBuilt` payload: `{ packageUris }`.
- ORM `packageUri text` → `packageUris jsonb` (migration, backfill null→{}).
- In-memory repo + integration test fixtures cập nhật theo.

### BuildPackageRunner.run()
- Idempotency: nếu `dist.packageUris` đã đủ nhóm → trả lại (không build lại).
- Loop nhóm → mỗi nhóm gọi `builder.build({ snapshotId, processCode đại diện, key: `${key}:${groupKey}` })` → gom `{ groupKey: path.uri }`.
- Trả `MARK_PACKAGE_BUILT { packageUris }`.

### SftpUploadRunner.run()
- Tính groupKey của channel (parseProcessCode từ spec.processCode) → đọc `dist.packageUriFor(groupKey)` thay vì `dist.packageUri`.
- Guard: thiếu uri cho nhóm → throw rõ ràng.

### Config resolve (infrastructure) — sửa rủi ro #1, #2
- Thêm `resolveAggregatorDeliveryConfig(aggregatorCode)` (hoặc mở rộng `resolveFullDeliveryConfig` nhận cờ) trả sender=AMG, recipient=aggregator ddexId/name, sftp=aggregator.sftpConfig, ernVersion=aggregator.sftpConfig.ernVersion, createsDoneFolder.
- Builder: nếu `buildConfig.isAggregator` → dùng resolve aggregator; else resolve theo DSP direct.
- SftpUploaderAdapter: tương tự — nhóm CI resolve SFTP theo aggregator, không theo dspCode.

## Related files
Sửa:
- application/step-runners/build-package.runner.ts
- application/step-runners/sftp-upload.runner.ts
- application/commands/distribution.command.ts (MarkPackageBuiltCommand)
- application/orchestrate.handler.ts (applyMarkPackageBuilt truyền map)
- domain/distribution/distribution.aggregate.ts (_packageUris, markPackageBuilt, getter, rehydrate)
- domain/distribution/distribution.types.ts (DistributionSnapshotRow.packageUri → packageUris)
- domain/events/distribution.events.ts (makePackageBuilt payload)
- infrastructure/persistence/distribution.orm-entity.ts (cột jsonb)
- infrastructure/persistence/distribution.repository.ts (save/load map)
- infrastructure/test-doubles/in-memory-distribution-repository.ts
- infrastructure/adapters/ddex-xml-package-builder.adapter.ts (resolve nhánh aggregator)
- infrastructure/adapters/sftp-uploader.adapter.ts (resolve nhánh aggregator)
- modules/distribution/dsp-routing/services/dsp-routing-config.service.ts (resolve aggregator)

Tạo:
- application/step-runners/group-channels-by-route.ts (helper)
- src/migrations/{ts}-distribution-package-uris-jsonb.ts

Cập nhật test:
- build-package.runner.spec.ts, sftp-upload.runner.spec.ts, distribution.aggregate.spec.ts, orchestrate.e2e.spec.ts, các integration spec dùng packageUri, distribution.repository.integration.spec.ts

## Todo
- [ ] Helper groupChannelsByRoute + unit test
- [ ] Đổi command/event/aggregate/types sang packageUris map
- [ ] Migration ORM text→jsonb + repo save/load
- [ ] BuildPackageRunner loop theo nhóm
- [ ] SftpUploadRunner đọc uri theo nhóm
- [ ] resolveAggregatorDeliveryConfig + sửa builder/uploader nhánh aggregator
- [ ] Cập nhật toàn bộ test + fixtures
- [ ] Chạy build + test suite phân phối, xanh hết

## Success criteria
- 1 distribution 3 DSP (Spotify/Apple/Facebook) → build đúng 2 package (SPOTIFY ERN4.3, CI ERN3.8.2 recipient=CI).
- Spotify upload SFTP Spotify; Apple+Facebook upload SFTP CI + .done.
- Idempotency giữ nguyên (redeliver không build lại).
- Toàn bộ test hiện có xanh.

## Unresolved questions
1. Nhóm CI có 2 lane deal(Facebook)/state51(Apple) → processCode khác (`ci.deal.initial` vs `ci.state51.initial`) nhưng cùng dspRoute=CI. Chọn processCode đại diện nào để build 1 XML? Đề xuất: build không phụ thuộc lane (chỉ ernVersion+recipient=CI), nên lane không ảnh hưởng XML — chọn cái đầu. Cần xác nhận CI không cần phân biệt deal/state51 ở tầng file.
2. recipient=CI: partyId/name lấy từ aggregator entity (PADPIDA20090302015 / Consolidated Independent) — đúng chứ?
3. Có cần giữ backward-compat đọc cột `packageUri` cũ cho distribution đang chạy dở, hay migration chạy khi không có bản ghi active?
