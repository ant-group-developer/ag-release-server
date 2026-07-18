# Tổng quan luồng phát hành hiện tại (Release Submit — Code Implementation)

> Tài liệu này mô tả **luồng phát hành đang chạy trong code** (module `release-executions3`),
> khác với file `Phát hành nhạc ...md` cùng thư mục (đó là spec nghiệp vụ/sản phẩm).
> Mọi mô tả dưới đây đối chiếu trực tiếp với source trên nhánh `dev-duc`.

## Mục lục

1. [Kiến trúc tổng thể](#1-kiến-trúc-tổng-thể)
2. [Điểm vào: Submit API](#2-điểm-vào-submit-api)
3. [Cây execution (Builder)](#3-cây-execution-builder)
4. [Engine duyệt cây](#4-engine-duyệt-cây)
5. [Worker xử lý leaf step](#5-worker-xử-lý-leaf-step)
6. [Queue & Cron](#6-queue--cron)
7. [Sync kết quả về DSP delivery](#7-sync-kết-quả-về-dsp-delivery)
8. [Bảng enum tham chiếu](#8-bảng-enum-tham-chiếu)
9. [Điểm cần lưu ý / câu hỏi mở](#9-điểm-cần-lưu-ý--câu-hỏi-mở)

---

## 1. Kiến trúc tổng thể

Module đang active: `src/modules/release/modules/release-executions3/`
(v1 `release-executions` phần lớn đã comment trong `release.module.ts`).

Ý tưởng: **1 lần submit = 1 execution = 1 cây step**. Engine duyệt cây đệ quy,
worker chạy nghiệp vụ ở leaf, status bubble-up từ lá lên gốc.

```text
Submit API (release.controller)
  -> release.service.submit3()
    -> ReleaseExecution3Service.newReleaseExecution()
      -> Queue.queueExecution()  (DB-backed, status NEW)

Cron (10s) consumeReleaseExecutions3
  -> startProcessing()
    -> parseMetadata()  (phân loại DSP: direct / CI-deal / state51)
    -> Builder.buildStepsChild()  (build cây step, lưu DB)
    -> Queue.queueRunPipeline()

Cron (10s) consumeRunPipelineQueue
  -> runPipeline()
    -> Engine.processStep(root...)  (đệ quy)
      -> Worker.dispatchStepTask(leaf)  (gRPC / SFTP / CI API / email)
    -> syncExecutionOutputToReleaseDeliveryDsp()
```

Các thành phần chính:

| Thành phần | File | Vai trò |
|-----------|------|---------|
| Service | `services/release-execution3.service.ts` | Tạo execution, parseMetadata, runPipeline |
| Builder | `services/release-execution3.builder.ts` | Sinh cây step (chỉ build, không chạy nghiệp vụ) |
| Engine | `services/release-execution3.engine.ts` | Duyệt cây, resolve status, sync delivery |
| Worker | `services/release-execution3.worker.ts` | Chạy nghiệp vụ thật ở leaf step |
| Result | `services/release-execution3-result.service.ts` | Gom result, sync sang release_dsp_delivery |
| CI Job | `services/ci-distribution-job3.service.ts` | Xử lý export CI / email State51 |
| Queue | `services/queue/*.ts` | Hàng đợi DB-backed (không dùng Redis/Bull) |

---

## 2. Điểm vào: Submit API

`src/modules/release/controllers/release.controller.ts`

| Method | Path | DTO | Service |
|--------|------|-----|---------|
| POST | `/releases/:id/submit` | `SubmitReleaseDto` | `submit3(id, dto)` |
| POST | `/releases/bulk-submit` | `BulkSubmitReleaseDto` | `bulkSubmit(dto)` |
| POST | `/releases/bulk-submit/preview-result` | `BulkSubmitReleaseDto` | `previewBulkSubmitResult(dto)` |
| POST | `/releases/auto-submit-undistributed-music` | `AutoSubmitUndistributedMusicReleaseDto` | `autoSubmitUndistributedMusicReleases(dto)` (fire-and-forget) |
| POST | `/releases/auto-submit-undistributed-music/preview` | `AutoSubmitUndistributedMusicReleaseDto` | `previewAutoSubmitUndistributedMusicReleases(dto)` |
| POST | `/releases/:id/takedown` | `SubmitReleaseDto` | `takedown(id, userId, dto)` |

### `SubmitReleaseDto` (`dto/submit-release.dto.ts`)

- `code: string[]` — danh sách DSP code cần submit.
- `needImportAgain?: boolean` — override cờ import CI trên **snapshot** (không lưu DB).

### `submit3()` — `release.service.ts:792`

```text
1. bulkSyncDataCi({ ids:[id] })          # sync CI data, lỗi được nuốt (try/catch)
2. findOneReleaseFull({ releaseId })     # load release + toàn bộ quan hệ
3. applyCiImportActionToReleaseSnapshot(release, dto.needImportAgain)
                                          # chỉ mutate snapshot in-memory
4. releaseRepo.update(id, { status: SUBMITTED, releaseEndDate: null })
5. newReleaseExecution({ release, dspCodes: dto.code, type: INITIAL_RELEASE })
                                          # enqueue execution (status NEW)
```

> **Lưu ý:** `submit3` **không có validation gate**. `ensureNonDraftRelease()` và
> `getErrorsSchemaRelease()` tồn tại trong `release.validate.service.ts` nhưng
> KHÔNG được gọi trong đường submit — validate schema chỉ chạy ở step `VALIDATE`
> bên trong pipeline (xem mục 5). `validate()` chỉ chạy ở `release.update()`.

### `bulkSubmit()` — `release.service.ts:518`

Vòng lặp tuần tự: mỗi id → `previewBulkSubmitResult()` (tính DSP code cần đổi)
→ `submit3(id, submitData)`.

### `previewBulkSubmitResult()` — `release.service.ts:533`

Tính toán DSP nào cần submit dựa trên `release_dsp_delivery` hiện tại:
- `skipDistributed=true` (mặc định) → bỏ qua DSP đã `distributed`.
- Trả về `submitData { id, code, skipCodes, needImportAgain }`.

### `takedown()` — `release.service.ts:819`

Set `releaseEndDate = now` rồi gọi lại `submit3(id, dto)` (dùng chung pipeline).

### Chuyển trạng thái `ReleaseStatus`

`draft → submitted` (do `submit3`) `→ processing → distributed / failed / taken_down`.

---

## 3. Cây execution (Builder)

`parseMetadata()` (`service.ts:154`) phân loại DSP dựa trên `dspRoutingConfig`:

```text
dspCodes[]
├── Direct DSP        (config.mode != AGGREGATOR, hoặc aggregator != CI)
└── CI Aggregator     (mode = AGGREGATOR & aggregator.code = 'CI')
    ├── CI-deal        (dsp.hasDeal = true)
    └── State51        (dsp.hasDeal = false)
```

- `isSkipImport = (releaseSnapshot.ciData.needImportAgain === false)` → nếu true thì bỏ qua nhánh IMPORT_CI.
- `primaryDsp` = DSP CI đầu tiên `resolveFullDeliveryConfig()` thành công.
- Ngay sau parse: seed toàn bộ DSP với status `NEVER_DISTRIBUTED` vào result.

`Builder.buildStepsChild()` (`builder.ts`) đệ quy sinh cây. Cấu trúc đầy đủ:

```text
(root)
├── GEN_UPC                       # chỉ khi chưa có upc & type != video
├── GEN_ISRCS                     # chỉ khi có track/video thiếu isrc
│   └── GEN_ISRC (mỗi track/video 1 step)
├── VALIDATE
└── PROCESS_DSPS  [parallel] [delivery]
    ├── PROCESS_DIRECT  [parallel]              # nếu có DSP direct
    │   └── PROCESS_DIRECT_CHILD  [delivery]    # mỗi DSP direct 1 nhánh (sequential)
    │       ├── CREATE_METADATA_ON_SERVER
    │       ├── UPLOAD_METADATA_TO_SFTP
    │       ├── WAIT_PARTNER_PROCESS  (DEFAULT_WAIT_MINUTES)
    │       └── SYNC_DATA_PARTNER
    └── PROCESS_AGG  [parallel]                 # nếu có DSP qua CI
        └── PROCESS_AGG_CI  [delivery]
            ├── IMPORT_CI                        # skip nếu isSkipImport
            │   ├── CREATE_METADATA_ON_SERVER
            │   ├── UPLOAD_METADATA_TO_SFTP
            │   ├── CREATE_FOLDER_DONE_CI
            │   ├── WAIT_PARTNER_PROCESS  (DEFAULT_WAIT_MINUTES)
            │   ├── GET_RESULT_IMPORT_CI
            │   └── VALIDATE_QA_CI
            ├── EXPORT_CI  [parallel]
            │   ├── EXPORT_AGG_CI_CI             # DSP CI-deal
            │   │   └── WAITING_ADMIN_EXPORT
            │   └── EXPORT_AGG_CI_STATE51        # DSP State51
            │       └── SEND_EMAIL_STATE51
            ├── WAIT_PARTNER_PROCESS  (MINUTES_PER_DAY)
            └── SYNC_DATA_DSP_CI  [delivery]
```

Ghi chú:
- Step không ghi `childExecutionMode` → mặc định chạy **sequential**.
- `isDeliveryStep = true`: `PROCESS_DSPS`, `PROCESS_DIRECT_CHILD`, `PROCESS_AGG_CI`, `SYNC_DATA_DSP_CI`.
- `REVIEW_RELEASE` đã có enum + worker nhưng **đang comment** trong builder (`builder.ts:72`).
- Step type lưu DB dạng varchar → thêm step mới không cần migration.

---

## 4. Engine duyệt cây

`ReleaseExecutionStepEngine.processStep()` (`engine.ts:38`) — đệ quy:

```text
processStep(step):
  nếu leaf (không con):
    - execution CANCELLED  -> return CANCELLED
    - đã ở final/WAITING_ACTION -> return status cũ
    - WAITING_PARTNER & chưa tới scheduledAt -> return WAITING_PARTNER
    - set PROCESSING -> worker.dispatchStepTask() -> lưu status trả về
  nếu có con:
    - sequential: chạy con theo order; gặp status dừng -> resolve & return
    - parallel: Promise.allSettled(tất cả con) -> resolve
    - resolveStatusByChild() bubble-up
```

### Status bubble-up (`resolveStatusByChild`, `engine.ts:179`)

Ưu tiên từ trên xuống:

| Điều kiện con | Status cha |
|---------------|-----------|
| có `WAITING_ACTION` | WAITING_ACTION |
| có `WAITING_PARTNER` | WAITING_PARTNER |
| có `FAILED` | FAILED |
| có `CANCELLED` | CANCELLED |
| có `PROCESSING` | PROCESSING |
| tất cả `DONE`/`SKIPPED` | DONE |
| còn lại | NEW |

### Điều kiện dừng nhánh sequential (`shouldStopSequential`)

`FAILED`, `WAITING_ACTION`, `WAITING_PARTNER`, `CANCELLED`.

### runPipeline (`service.ts:121`)

Duyệt từng root step; nếu 1 root trả status dừng → set execution status tương ứng & return sớm.
`finally` **luôn** gọi `syncExecutionOutputToReleaseDeliveryDsp()`.

### Resume & Retry

- **Resume không gọi đúng step kế tiếp** — enqueue lại `queueRunPipeline(executionId)`,
  load lại cây, bỏ qua step đã final/WAITING_ACTION, chạy tiếp step còn chạy được.
- Nguồn resume: cron thấy `WAITING_PARTNER` tới hạn; admin/CI job update step; user retry subtree.
- Retry subtree: set step + toàn bộ con về `NEW`, clear `startedAt/completedAt/output`, rồi rerun pipeline.

---

## 5. Worker xử lý leaf step

`ReleaseExecution3Worker.dispatchStepTask()` (`worker.ts:62`) — switch theo step type.

| Step | Hành động | Gọi ngoài | Trả về | Idempotent |
|------|-----------|-----------|--------|------------|
| `GEN_UPC` | `releaseService.genUpcById()`, lưu UPC | service nội bộ | DONE/FAILED | ✗ |
| `GEN_ISRC` | `trackService.genISRC` / `videoService.genISRC` | service nội bộ | DONE/FAILED | ✗ |
| `VALIDATE` | `releaseValidateService.getErrorsSchemaRelease(snapshot)` | — | DONE/FAILED | ✓ |
| `REVIEW_RELEASE` | find-or-create `ReleaseReview` | — | WAITING_ACTION | ✓ |
| `CREATE_METADATA_ON_SERVER` | ghi DDEX XML ra đĩa, lưu `outputDir`/`batchId` | `dspRoutingService` | DONE/FAILED | ✗ |
| `UPLOAD_METADATA_TO_SFTP` | `sftp.uploadFolder()`, xóa `outputDir` ở `finally` | SFTP | DONE/FAILED | ✗ |
| `CREATE_FOLDER_DONE_CI` | tạo folder `{batchId}.done` trên SFTP | SFTP | DONE/FAILED | ✗ |
| `WAIT_PARTNER_PROCESS` | lần đầu set `scheduledAt = now+wait`; sau đó so với now | — | WAITING_PARTNER/DONE | ✓ |
| `GET_RESULT_IMPORT_CI` | query CI import theo `batchId`, tạo `ReleaseError` nếu lỗi | CI REST | DONE/FAILED | ✗ |
| `VALIDATE_QA_CI` | `getQaFlagsCi()`, fail nếu còn QA flag | service nội bộ | DONE/FAILED | ✓ |
| `WAITING_ADMIN_EXPORT` | tạo `CiDistributionJob3` (ADMIN_EXPORT) | job DB | WAITING_ACTION | ✓ (check `jobCreated`) |
| `SEND_EMAIL_STATE51` | tạo `CiDistributionJob3` (EMAIL_STATE51) | job DB | WAITING_ACTION | ✓ (check `jobCreated`) |
| `SYNC_DATA_DSP_CI` | `getStatusDspsCi()`, DSP thiếu → ISSUES | service nội bộ | DONE/FAILED | ✗ |
| `SYNC_DATA_PARTNER` | VEVO: đọc response SFTP; khác: log DONE | SFTP (VEVO) | DONE/FAILED | ✗ |
| `SYNC_RESULT_TO_RELEASE` | no-op stub | — | DONE | — |
| các step cha (`PROCESS_*`, `EXPORT_*`) | `deriveStatusFromChildren()` | — | DONE | — |
| `IMPORT_CI` | nếu `isSkipImport` → SKIPPED, ngược lại derive | — | SKIPPED/DONE | ✓ |

Nguyên tắc: step tạo job/waiting phải **idempotent** vì pipeline rerun nhiều lần → check `metadata.output.jobCreated` trước khi tạo.

---

## 6. Queue & Cron

Queue là **DB-backed** (không dùng Redis/BullMQ).

| Queue entity | Trạng thái | Concurrency |
|--------------|-----------|-------------|
| `ReleaseExecution3` | NEW → PROCESSING → DONE/FAILED/CANCELLED | 1 per `releaseId` (dedup); global guard `isConsumingExecutions` |
| `ReleaseExecution3RunPipelineQueue` | NEW → PROCESSING → DONE/FAILED | nhiều job đồng thời, giới hạn theo disk budget (max 25 GiB) |

Cron (đăng ký ở `src/modules/schedule/schedule.service.ts`):

| Job | Lịch | Việc |
|-----|------|------|
| `consumeReleaseExecutions3` | mỗi 10s | pick execution NEW, dedup theo releaseId, `startProcessing()` |
| `consumeReleaseExecution3RunPipelineQueue` | mỗi 10s | pick run-pipeline NEW, batch theo disk budget, `runPipeline()` song song |
| `resumeWaitingSteps` | mỗi 1 phút | resume WAITING_PARTNER tới `scheduledAt` |
| `checkCiToolJobStatus` | mỗi 10s | poll CI Tool cho ADMIN_EXPORT PROCESSING, finalize khi xong |
| `ci-daily-send-v3` | `0 8 * * *` (configurable) | xử lý toàn bộ CI export/email PENDING |
| `refreshCiToolToken` | daily 00:00 | refresh OAuth token CI Tool |

### CI Distribution Job (`ci-distribution-job3.service.ts`)

`processJobs()` (`:200`) gom job theo type:
- **EMAIL_STATE51**: gom theo `deliveryEmail`, export Excel, gửi mail (Resend) kèm attachment → `finalizeJobs(COMPLETED, DONE)` / `(FAILED, FAILED)`.
- **ADMIN_EXPORT**: export Excel, POST lên CI Tool (nhận `ciToolJobId`), set PROCESSING + `nextCiToolCheckAt`; cron poll kết quả → finalize.
- `finalizeJobs()` (`:639`) gọi `updateStatusStepAndRerunPipeline(stepId, DONE/FAILED)` → resume pipeline.

---

## 7. Sync kết quả về DSP delivery

Chỉ step `isDeliveryStep = true` mới sync. Luồng (`engine.ts:299` + `result.service.ts`):

```text
step đổi status
-> mapStepStatusToDeliveryStatus(step, status)
     DONE                      -> DISTRIBUTED
     FAILED/CANCELLED/SKIPPED  -> ISSUES
     trung gian                -> null (không đổi)
-> ghép với metadata.input.delivery.items (ưu tiên metadata.output.result theo dspCode)
-> updateExecutionOutputResult()  (upsert release_execution_results3)
-> syncToReleaseDspDelivery()
-> ReleaseDspDeliveryService.updateDeliveryStatus()
```

Upsert theo key `(releaseExecutionId, dspId)`, chỉ ghi đè khi status mới có **priority cao hơn**:

| ReleaseDspStatus | Priority (nhỏ = thắng) |
|------------------|------------------------|
| DISTRIBUTED / TAKEN_DOWN / ISSUES | 1 |
| PROCESSING | 2 |
| NEVER_DISTRIBUTED | 3 |
| DRAFT | 4 |

API đọc kết quả cho FE: `POST /release-dsp-deliveries/sync-and-get/release/:releaseId`
(`release-dsp-delivery.controller.ts`).

---

## 8. Bảng enum tham chiếu

`enums/release-execution3.enum.ts`

**`ReleaseExecutionStepStatus`**: NEW, PROCESSING, WAITING_ACTION, WAITING_PARTNER, SKIPPED, DONE, FAILED, CANCELLED
(execution status giống nhưng không có SKIPPED).

**`ExecutionType`**: INITIAL_RELEASE, UPDATE, TAKEDOWN, RETRY.

**`ExecutionStepMode`**: sequential, parallel.

**`CiJobType3`**: EMAIL_STATE51, ADMIN_EXPORT.
**`CiJobStatus3`**: PENDING, PROCESSING, COMPLETED, FAILED, CANCEL.

---

## 9. Điểm cần lưu ý / câu hỏi mở

- `submit3` không chặn release DRAFT/thiếu field — chỉ step `VALIDATE` trong pipeline mới validate schema. `ensureNonDraftRelease()` tồn tại nhưng chưa wire vào submit.
- `REVIEW_RELEASE` đã có worker + service xử lý nhưng builder đang comment → luồng kiểm duyệt thủ công **chưa bật**.
- `SYNC_RESULT_TO_RELEASE` (`worker.ts:1065`) là no-op stub — chưa rõ intentional hay pending.
- `isSkipImport` (worker/service) vs `needImportAgain` (DTO/entity) — commit `f2dc7b56` đổi tên; cần rà soát đã đồng bộ hết chưa.
- `takedown()` set status SUBMITTED (không phải TAKEN_DOWN) rồi submit lại — TAKEN_DOWN được set ở nơi khác trong pipeline.
- Nhiều worker task **không idempotent** (GEN_UPC, CREATE_METADATA, GET_RESULT_IMPORT_CI...) — cần cẩn trọng khi pipeline rerun.

