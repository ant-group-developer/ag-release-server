# Release Execution 3 - Services

File này mô tả từng service trong module `release-executions3`: service đó làm gì, nằm ở đâu trong luồng, các hàm chính và khi thêm nghiệp vụ thì thường sửa service nào.

## 1. Tổng quan service

| Service | File | Vai trò |
| ------- | ---- | ------- |
| `ReleaseExecution3Service` | `services/release-execution3.service.ts` | Service điều phối chính của execution |
| `ReleaseExecution3QueryService` | `services/release-execution3.query.service.ts` | Query execution/step, build tree cho detail/list |
| `ReleaseExecution3Builder` | `services/release-execution3.builder.ts` | Build cây step từ execution metadata |
| `ReleaseExecutionStepEngine` | `services/release-execution3.engine.ts` | Duyệt cây, chạy step, resolve status |
| `ReleaseExecution3Worker` | `services/release-execution3.worker.ts` | Chạy nghiệp vụ thật cho leaf step |
| `ReleaseExecution3ResultService` | `services/release-execution3-result.service.ts` | Upsert result từng DSP và sync sang delivery |
| `ReleaseExecution3Queue` | `services/queue/release-execution3.queue.ts` | Tạo execution queue và run-pipeline queue |
| `ReleaseExecution3Consumer` | `services/queue/release-execution3.consumer.ts` | Consumer DB queue |
| `ReleaseExecution3CronJobService` | `services/release-execution3.cron-job.service.ts` | Facade để schedule service gọi cron jobs |
| `CiDistributionJob3Service` | `services/ci-distribution-job3.service.ts` | Xử lý external jobs của CI export/email |
| `ReleaseExecution3WorkerTest` | `services/release-execution3-test.worker.ts` | Worker test/dev, cùng shape với worker chính |

Luồng tổng quát:

```text
ReleaseService.submit3()
-> ReleaseExecution3Service.newReleaseExecution()
-> ReleaseExecution3Queue.queueExecution()
-> ReleaseExecution3Consumer.consumerExecutions()
-> ReleaseExecution3Service.startProcessing()
-> ReleaseExecution3Builder.buildStepsChild()
-> ReleaseExecution3Queue.queueRunPipeline()
-> ReleaseExecution3Consumer.consumeRunPipelineQueue()
-> ReleaseExecution3Service.runPipeline()
-> ReleaseExecutionStepEngine.processStep()
-> ReleaseExecution3Worker.dispatchStepTask()
-> ReleaseExecution3ResultService.updateExecutionOutputResult()
```

## 2. `ReleaseExecution3Service`

File: `services/release-execution3.service.ts`

Đây là service trung tâm, điều phối lifecycle của execution. Service này không trực tiếp làm hết nghiệp vụ như upload/generate/send mail, mà gọi sang queue, builder, engine, query service và result service.

### Trách nhiệm chính

- Tạo execution mới qua queue.
- Start execution `NEW`.
- Cancel execution cũ cùng release/DSP khi execution mới chạy.
- Parse DSP metadata thành direct/CI/State51.
- Build cây step.
- Enqueue run-pipeline.
- Chạy pipeline qua engine.
- Refresh execution status.
- Retry subtree.
- Update status step từ external action rồi rerun pipeline.
- Query list/detail execution.

### Hàm chính

| Hàm | Vai trò |
| --- | ------- |
| `newReleaseExecution()` | Tạo execution `NEW` thông qua `ReleaseExecution3Queue.queueExecution()` |
| `startProcessing(id)` | Chuyển execution `NEW` sang `PROCESSING`, parse metadata, build tree, queue run pipeline |
| `runPipeline(id)` | Load execution tree, chạy từng root step qua engine |
| `resumeWaitingSteps()` | Tìm step `WAITING_PARTNER` đã tới giờ rồi enqueue pipeline |
| `syncExecutionOutputToReleaseDeliveryDsp(id)` | Sync lại result của execution sang `release_dsp_delivery` |
| `getList(query)` | Query list execution, kèm status counts |
| `cancelPendingExecutions(input)` | Cancel execution/step/job/review cũ cùng release/DSP |
| `retryStep(stepId)` | Reset step và descendants về `NEW`, rồi queue pipeline |
| `autoRetrySyncDataDspCiFailedSteps()` | Batch retry các step `SYNC_DATA_DSP_CI` failed |
| `updateStatusStepAndRerunPipeline()` | External job/admin update step status rồi queue pipeline |
| `findOne(id)` | Lấy detail execution qua query service |

### `parseMetadata()`

`parseMetadata()` là điểm chia DSP thành nhóm:

```text
dspCodes[]
├── dspDirect
└── dspAggregator.ci
    ├── ci
    └── state51
```

Nó cũng tạo `metadata.input.delivery`:

```text
delivery.all
delivery.directByDspId
delivery.aggCi
```

Sau đó service khởi tạo `release_execution_results3` với status `never_distributed` cho các DSP trong execution.

### Khi nào sửa service này

Sửa `ReleaseExecution3Service` khi:

- Cần đổi lifecycle tổng của execution.
- Cần đổi cách phân loại DSP.
- Cần thêm nhóm aggregator mới vào metadata.
- Cần đổi rule cancel execution cũ.
- Cần đổi rule derive execution status.
- Cần thêm API/logic retry/resume cấp execution.

Không nên nhét logic nghiệp vụ leaf vào service này. Logic leaf nên nằm ở worker.

## 3. `ReleaseExecution3QueryService`

File: `services/release-execution3.query.service.ts`

Service này gom các query phục vụ execution list/detail, pending execution, waiting steps và filter theo step.

### Trách nhiệm chính

- Query pending executions để cancel/skip duplicate.
- Query waiting partner steps đã tới `scheduledAt`.
- Build query list execution.
- Filter execution theo status/type/release/query release/step.
- Count execution theo status.
- Load detail execution và build step tree.

### Hàm chính

| Hàm | Vai trò |
| --- | ------- |
| `getPendingExecutions()` | Tìm execution cũ cùng release/DSP đang pending để cancel |
| `getListWaitingSteps(now)` | Tìm step `WAITING_PARTNER` đã tới giờ |
| `createQbGetList(query)` | Tạo query builder list execution |
| `getStatusCounts(query)` | Count execution theo status |
| `findOne(id)` | Load execution detail, logs, steps và build tree |

### `buildStepTreeList()`

DB lưu step dạng flat table có `parentStepId`. Query service build lại tree:

```text
flat steps
-> map by id
-> attach child to parent
-> return roots
```

### Khi nào sửa service này

Sửa query service khi:

- Cần thêm filter execution list.
- Cần filter theo step mới.
- Cần thêm latest-only/query release behavior.
- Cần thay đổi cách load tree/logs.
- Cần tối ưu query detail/list.

## 4. `ReleaseExecution3Builder`

File: `services/release-execution3.builder.ts`

Builder chỉ tạo cây step. Nó không chạy nghiệp vụ thật.

### Trách nhiệm chính

- Nhìn vào execution metadata để quyết định cần step nào.
- Tạo root steps.
- Tạo child steps theo từng step type.
- Gán `releaseExecutionId`.
- Gán `parentStepId`.
- Gán `order`.
- Gán `childExecutionMode`.
- Gán `isDeliveryStep`.
- Gán `metadata.input` ban đầu.

### Pattern build

Builder dùng `switch (STEP?.type)`:

```text
undefined
-> root steps

GEN_ISRCS
-> GEN_ISRC per track/video

PROCESS_DSPS
-> PROCESS_DIRECT
-> PROCESS_AGG

PROCESS_DIRECT
-> PROCESS_DIRECT_CHILD per DSP

PROCESS_DIRECT_CHILD
-> CREATE_METADATA_ON_SERVER
-> UPLOAD_METADATA_TO_SFTP
-> WAIT_PARTNER_PROCESS
-> SYNC_DATA_PARTNER

PROCESS_AGG
-> PROCESS_AGG_CI

PROCESS_AGG_CI
-> IMPORT_CI
-> EXPORT_CI
-> WAIT_PARTNER_PROCESS
-> SYNC_DATA_DSP_CI

EXPORT_CI
-> EXPORT_AGG_CI_CI
-> EXPORT_AGG_CI_STATE51
```

### Khi nào sửa builder

Sửa builder khi:

- Thêm step mới vào cây.
- Đổi thứ tự step.
- Đổi parent/child relationship.
- Đổi sequential/parallel mode.
- Thêm nhánh aggregator mới.
- Thêm delivery step mới.
- Cần truyền metadata input cho worker.

Nguyên tắc: builder chỉ build structure. Không gọi external service nặng trong builder.

## 5. `ReleaseExecutionStepEngine`

File: `services/release-execution3.engine.ts`

Engine là máy duyệt cây. Nó quyết định step nào được chạy, chạy child theo sequential/parallel, update status và sync delivery result nếu cần.

### Trách nhiệm chính

- Duyệt cây đệ quy.
- Bỏ qua step đã final hoặc đang waiting.
- Set step `PROCESSING`.
- Gọi worker cho leaf step.
- Chạy child theo `childExecutionMode`.
- Resolve status parent từ child.
- Sync delivery result cho `isDeliveryStep`.
- Sync full execution output sang delivery.

### Hàm chính

| Hàm | Vai trò |
| --- | ------- |
| `processStep()` | Hàm chính duyệt step/children |
| `resolveStatusByChild()` | Resolve status parent từ children |
| `updateStepStatus()` | Save status/timestamps và sync delivery nếu cần |
| `syncDeliveryStatusByStepStatus()` | Tạo result từ delivery step |
| `syncExecutionOutputToReleaseDeliveryDsp()` | Sync lại toàn bộ result của execution |

### Leaf vs parent

Leaf step:

```text
set PROCESSING
-> worker.dispatchStepTask()
-> update status returned by worker
```

Parent step:

```text
set PROCESSING
-> process child steps
-> resolve status from children
-> update parent status
```

### Sequential vs parallel

Sequential:

```text
for child in children:
  status = processStep(child)
  if status is FAILED/CANCELLED/WAITING_ACTION/WAITING_PARTNER:
    stop current parent
```

Parallel:

```text
Promise.allSettled(children.map(processStep))
resolve parent after all child branches settle
```

### Khi nào sửa engine

Sửa engine khi:

- Đổi rule duyệt cây.
- Đổi rule stop sequential.
- Đổi rule resolve status cha.
- Đổi rule skip final/waiting step.
- Đổi cách sync delivery từ step.

Không nên thêm nghiệp vụ riêng của từng step vào engine. Nghiệp vụ step nằm ở worker.

## 6. `ReleaseExecution3Worker`

File: `services/release-execution3.worker.ts`

Worker chạy nghiệp vụ thật cho leaf step. Engine gọi worker qua `dispatchStepTask()`.

### Trách nhiệm chính

- Dispatch step type sang method xử lý.
- Gọi service bên ngoài module: release, track, video, DDEX, SFTP, CI, review, notification job.
- Ghi `metadata.output`.
- Ghi logs success/error.
- Trả về `ReleaseExecutionStepStatus`.

### Nhóm task chính

| Nhóm | Step | Logic |
| ---- | ---- | ----- |
| Generator | `GEN_UPC`, `GEN_ISRC` | Gọi service sinh UPC/ISRC |
| Validate/review | `VALIDATE`, `REVIEW_RELEASE` | Validate schema hoặc tạo review chờ admin |
| Direct DSP | `CREATE_METADATA_ON_SERVER`, `UPLOAD_METADATA_TO_SFTP`, `WAIT_PARTNER_PROCESS`, `SYNC_DATA_PARTNER` | Tạo metadata, upload, chờ partner, sync response |
| CI import | `CREATE_METADATA_ON_SERVER`, `UPLOAD_METADATA_TO_SFTP`, `CREATE_FOLDER_DONE_CI`, `GET_RESULT_IMPORT_CI`, `VALIDATE_QA_CI` | Import release lên CI và validate |
| CI export | `WAITING_ADMIN_EXPORT`, `SEND_EMAIL_STATE51` | Tạo `CiDistributionJob3`, trả `WAITING_ACTION` |
| CI sync | `SYNC_DATA_DSP_CI` | Lấy status DSP từ CI và ghi output result |
| Waiting | `WAIT_PARTNER_PROCESS` | Set `scheduledAt`, trả `WAITING_PARTNER` |

### `dispatchStepTask()`

Đây là map step type sang method:

```text
ReleaseExecutionStepType.X
-> this.x(context)
```

Khi thêm step leaf mới, thường phải thêm case ở đây.

### Parent step trong worker

Một số step như `PROCESS_DSPS`, `PROCESS_DIRECT`, `PROCESS_AGG_CI` có method worker nhưng chỉ trả `DONE`. Bình thường chúng có child nên engine xử lý child trước và resolve status từ child. Method này chỉ là fallback nếu step được gọi như leaf.

### Waiting action

Các step tạo external job hoặc review thường:

```text
create external record
save metadata.output.jobCreated/reviewCreated
return WAITING_ACTION
```

Pipeline dừng, chờ service khác gọi:

```text
updateStatusStepAndRerunPipeline(stepId, DONE/FAILED)
```

### Idempotency

Worker có thể bị gọi lại khi pipeline rerun. Các step tạo job cần check metadata trước để không tạo duplicate:

```text
if (!step.metadata?.output?.jobCreated) {
  createJob()
  step.metadata.output.jobCreated = true
}

return WAITING_ACTION
```

### Khi nào sửa worker

Sửa worker khi:

- Thêm step leaf mới.
- Đổi logic generate/validate/upload/sync.
- Đổi cách tạo CI job/review.
- Đổi output metadata của step.
- Đổi logging nghiệp vụ.

## 7. `ReleaseExecution3ResultService`

File: `services/release-execution3-result.service.ts`

Service này quản lý `release_execution_results3` và sync sang `release_dsp_delivery`.

### Trách nhiệm chính

- Nhận result từ execution/step.
- Resolve `dspCode` sang `dspId` nếu cần.
- Giữ latest result theo `releaseExecutionId + dspId`.
- Áp priority status để tránh ghi lùi.
- Sync result sang `ReleaseDspDeliveryService.updateDeliveryStatus()`.

### Hàm chính

| Hàm | Vai trò |
| --- | ------- |
| `updateExecutionOutputResult()` | Upsert result rồi sync delivery |
| `syncToReleaseDspDelivery()` | Lấy latest result của execution và update `release_dsp_delivery` |
| `resolveResultItems()` | Map input result sang `{ dspId, status }` |

### Priority

Service có priority status:

```text
distributed/issues/taken_down
> processing
> never_distributed
> draft
```

Mục tiêu: status final không bị ghi lùi bởi status nhẹ hơn.

### Khi nào sửa result service

Sửa service này khi:

- Đổi rule priority.
- Đổi cách map `dspCode` sang `dspId`.
- Đổi cách sync sang `release_dsp_delivery`.
- Muốn support thêm loại result/projection.

## 8. `ReleaseExecution3Queue`

File: `services/queue/release-execution3.queue.ts`

Service này tạo DB queue records.

### Trách nhiệm chính

- Tạo `ReleaseExecution3` status `NEW`.
- Tạo `ReleaseExecution3RunPipelineQueue` status `NEW`.

### Hàm chính

| Hàm | Vai trò |
| --- | ------- |
| `queueExecution()` | Insert execution `NEW` từ release snapshot và dspCodes |
| `queueRunPipeline()` | Insert run-pipeline queue job |

### Khi nào sửa queue service

Sửa service này khi:

- Đổi payload khởi tạo execution.
- Thêm metadata mặc định lúc queue execution.
- Đổi cách enqueue run pipeline.
- Muốn thêm dedupe ngay khi enqueue.

Hiện dedupe chính nằm ở consumer, không nằm ở queue service.

## 9. `ReleaseExecution3Consumer`

File: `services/queue/release-execution3.consumer.ts`

Consumer đọc DB queue và gọi service xử lý.

### Trách nhiệm chính

- Consume execution `NEW`.
- Group execution theo `releaseId`, chỉ giữ execution mới nhất.
- Cancel duplicate/pending execution cũ.
- Consume run-pipeline queue.
- Group run-pipeline job theo `releaseExecutionId`, chỉ giữ job mới nhất.
- Mark job cũ là `FAILED` vì superseded.
- Ước tính disk usage trước khi chạy batch pipeline.
- Chạy nhiều pipeline jobs bằng `Promise.allSettled()`.

### Hàm chính

| Hàm | Vai trò |
| --- | ------- |
| `consumerExecutions()` | Scan execution `NEW`, chọn execution mới nhất mỗi release, gọi `startProcessing()` |
| `consumeRunPipelineQueue()` | Scan run-pipeline jobs, dedupe, chọn batch, gọi `processRunPipelineJob()` |
| `selectPipelineBatch()` | Chọn batch jobs không vượt giới hạn disk estimate |
| `processRunPipelineJob()` | Mark job processing, gọi `runPipeline()`, mark done/failed |

### Lock trong process

Consumer dùng flag:

```text
isConsumingExecutions
isConsumingRunPipeline
```

Đây là lock trong một process. Nếu chạy nhiều instance, vẫn cần distributed lock hoặc DB row locking để tránh double consume.

### Khi nào sửa consumer

Sửa consumer khi:

- Đổi rule dedupe execution.
- Đổi rule dedupe run pipeline job.
- Đổi concurrency/batch strategy.
- Đổi disk estimate.
- Thêm retry attempts thật sự cho queue job.

## 10. `ReleaseExecution3CronJobService`

File: `services/release-execution3.cron-job.service.ts`

Service này là facade mỏng để `ScheduleService` gọi các job trong module.

### Trách nhiệm chính

- Delegate cron resume waiting steps.
- Delegate CI Tool status check.
- Delegate CI daily send.
- Delegate consume executions.
- Delegate consume run-pipeline queue.

### Hàm chính

| Hàm | Delegate tới |
| --- | ------------ |
| `resumeWaitingSteps()` | `ReleaseExecution3Service.resumeWaitingSteps()` |
| `checkCiToolJobStatus()` | `CiDistributionJob3Service.checkCiToolJobStatus()` |
| `handleDailySend()` | `CiDistributionJob3Service.handleDailySend()` |
| `consumeExecutions()` | `ReleaseExecution3Consumer.consumerExecutions()` |
| `consumeRunPipelineQueue()` | `ReleaseExecution3Consumer.consumeRunPipelineQueue()` |

### Khi nào sửa cron job service

Ít khi cần sửa. Chỉ sửa khi:

- Thêm cron task mới thuộc release execution v3.
- Muốn đổi facade method cho schedule.
- Muốn thêm logging/wrapping chung quanh cron calls.

Cron expression nằm ở `src/modules/schedule/schedule.service.ts`, không nằm trong service này.

## 11. `CiDistributionJob3Service`

File: `services/ci-distribution-job3.service.ts`

Service này xử lý external jobs của nhánh CI. Nó độc lập với engine ở chỗ job có lifecycle riêng, nhưng khi hoàn tất thì resume pipeline bằng `updateStatusStepAndRerunPipeline()`.

### Trách nhiệm chính

- Tạo CI distribution job.
- Query/list/group job cho admin UI.
- Export Excel cho CI job.
- Daily send pending jobs.
- Gửi ADMIN_EXPORT sang CI Tool.
- Gửi EMAIL_STATE51 qua email.
- Poll CI Tool job status.
- Finalize job và update step status.
- Cancel/update job từ admin.

### Hàm chính

| Hàm | Vai trò |
| --- | ------- |
| `createJob()` | Tạo `CiDistributionJob3` status `PENDING` |
| `handleDailySend()` | Cron batch lấy pending jobs và process |
| `processJobs(ids)` | Process một list jobs theo type |
| `sendExportToCi()` | Tạo Excel và gửi sang CI Tool |
| `sendEmailToState51()` | Group job theo email, tạo Excel, gửi mail |
| `checkCiToolJobStatus()` | Poll CI Tool và finalize jobs |
| `exportFileExcel()` | Tạo file Excel từ jobs |
| `finalizeJobs()` | Update job status, update step status, rerun pipeline |
| `updateJob()` | Update/cancel job từ admin |
| `getList()` / `getGrouped()` / `findOne()` | Query jobs |

### Job type

| Type | Ý nghĩa |
| ---- | ------- |
| `ADMIN_EXPORT` | Gom data, tạo Excel, gửi sang CI Tool |
| `EMAIL_STATE51` | Gom data, tạo Excel, gửi email State51 |

### Finalize

Khi job hoàn tất:

```text
job COMPLETED -> step DONE -> queueRunPipeline
job FAILED -> step FAILED -> queueRunPipeline
job CANCEL -> step CANCELLED -> queueRunPipeline
```

### Khi nào sửa CI job service

Sửa service này khi:

- Thêm job type mới.
- Đổi cách export Excel.
- Đổi cách gửi CI Tool/email.
- Đổi rule grouping jobs.
- Đổi polling interval/status mapping.
- Đổi cách finalize step.

## 12. `ReleaseExecution3WorkerTest`

File: `services/release-execution3-test.worker.ts`

Đây là worker test/dev có shape gần giống `ReleaseExecution3Worker`. Engine hiện import cả worker chính và worker test, nhưng provider đang dùng worker chính:

```ts
private readonly releaseExecution3Worker: ReleaseExecution3Worker
// private readonly releaseExecution3Worker: ReleaseExecution3WorkerTest
```

### Vai trò

- Dùng để test pipeline mà không chạy toàn bộ side-effect thật.
- Có thể mock hoặc rút gọn một số step.
- Hữu ích khi cần debug tree/engine mà không muốn upload/gửi external.

### Khi nào dùng/sửa

Sửa worker test khi:

- Muốn test step flow với output giả.
- Muốn bypass external service trong local/dev.
- Muốn mô phỏng lỗi/waiting/done cho engine.

Không nên để logic nghiệp vụ production chỉ tồn tại trong worker test.

## 13. Service dependency map

```text
ReleaseExecution3Service
├── ReleaseExecution3Queue
├── ReleaseExecution3Builder
├── ReleaseExecutionStepEngine
├── ReleaseExecution3QueryService
├── ReleaseExecution3ResultService
├── DspRoutingConfigsService
└── ReleaseService

ReleaseExecutionStepEngine
├── ReleaseExecution3Worker
├── ReleaseExecution3ResultService
└── LogsService

ReleaseExecution3Worker
├── DspRoutingConfigsService
├── SftpConnectService
├── ReleaseDdexService
├── ReleaseValidateService
├── ReleaseService
├── TrackService
├── VideoService
├── LogsService
├── CiImportService
├── ReleaseErrorService
├── ReleaseReviewService
└── CiDistributionJob3Service

CiDistributionJob3Service
├── FileExportCiService
├── NotificationResendService
├── ReleaseExecution3Service
└── CiToolService
```

## 14. Khi thêm nghiệp vụ thì sửa service nào

| Nghiệp vụ cần thêm | Service thường sửa |
| ------------------ | ------------------ |
| Thêm step vào cây | `ReleaseExecution3Builder` |
| Thêm logic chạy step leaf | `ReleaseExecution3Worker` |
| Đổi rule chạy tree | `ReleaseExecutionStepEngine` |
| Đổi rule status parent | `ReleaseExecutionStepEngine` |
| Thêm filter list execution | `ReleaseExecution3QueryService` |
| Đổi phân loại DSP | `ReleaseExecution3Service.parseMetadata()` |
| Thêm aggregator mới | `ReleaseExecution3Service`, `ReleaseExecution3Builder`, `ReleaseExecution3Worker` |
| Thêm external job mới | `ReleaseExecution3Worker`, `CiDistributionJob3Service` hoặc service job mới |
| Đổi sync delivery/result | `ReleaseExecution3ResultService`, `ReleaseExecutionStepEngine` |
| Đổi queue/dedupe/concurrency | `ReleaseExecution3Queue`, `ReleaseExecution3Consumer` |
| Thêm cron mới | `ReleaseExecution3CronJobService`, `ScheduleService` |

## 15. Mental model

Có thể nhớ ngắn gọn:

```text
Service        = điều phối execution
QueryService   = đọc DB và build tree
Builder        = tạo cây
Engine         = duyệt cây
Worker         = làm việc thật ở leaf
ResultService  = gom result và sync delivery
Queue          = ghi job vào DB
Consumer       = lấy job khỏi DB và chạy
CronJobService = facade cho scheduler
CiJobService   = xử lý job async ngoài pipeline
```
