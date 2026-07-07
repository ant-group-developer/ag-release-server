# Release Execution 3 - Entities

File này mô tả các entity chính trong module `release-executions3`: mỗi bảng dùng để làm gì, quan hệ với nhau, field quan trọng và cách dữ liệu đi qua execution tree.

## 1. Tổng quan entity

Module có 5 entity riêng:

| Entity | Bảng | Vai trò |
| ------ | ---- | ------- |
| `ReleaseExecution3` | `release_excutions3` | Job tổng cho một lần submit/retry/update/takedown release |
| `ReleaseExecutionStep3` | `release_execution_steps3` | Node trong cây step của execution |
| `ReleaseExecutionResult3` | `release_execution_results3` | Latest result theo từng DSP trong một execution |
| `ReleaseExecution3RunPipelineQueue` | `release_execution3_run_pipeline_queue` | Queue DB để rerun pipeline |
| `CiDistributionJob3` | `ci_distribution_jobs3` | External job cho nhánh CI export/email |

Quan hệ tổng quát:

```text
Release
└── ReleaseExecution3
    ├── ReleaseExecutionStep3
    │   ├── child ReleaseExecutionStep3
    │   ├── Logs
    │   ├── ReleaseError
    │   └── ReleaseExecutionResult3
    ├── ReleaseExecutionResult3
    ├── CiDistributionJob3
    ├── ReleaseReview
    ├── ReleaseError
    └── Logs

ReleaseExecution3RunPipelineQueue
└── releaseExecutionId
```

`ReleaseExecution3RunPipelineQueue` không khai báo relation TypeORM trực tiếp tới `ReleaseExecution3`, nhưng logic service dùng `releaseExecutionId` để gọi lại `runPipeline()`.

## 2. `ReleaseExecution3`

File: `entites/release-execution3.entity.ts`

Bảng: `release_excutions3`

Đây là entity cha của một lần chạy phân phối release. Mỗi lần admin submit release với một danh sách DSP sẽ tạo một execution mới ở status `NEW`.

Tên bảng đang là `release_excutions3`, bị typo chữ `executions`, nhưng đây là tên đang dùng trong code/migration.

### Field chính

| Field | Kiểu | Ý nghĩa |
| ----- | ---- | ------- |
| `id` | `uuid` | Khóa chính từ `BaseUUIDEntity` |
| `type` | `ExecutionType` | Loại execution: `INITIAL_RELEASE`, `UPDATE`, `TAKEDOWN`, `RETRY` |
| `releaseTitle` | `varchar` | Snapshot title để query/list nhanh |
| `releaseUpc` | `varchar` | Snapshot UPC để query/list nhanh |
| `releaseId` | `uuid` | Release đang được xử lý |
| `status` | `ReleaseExecutionStatus` | Status tổng của execution |
| `completedAt` | `timestamptz` | Set khi execution đi tới final status |
| `summary` | `text` | Summary hoặc error message |
| `metadata` | `jsonb` | Snapshot input, routing decision, delivery input |

### Relation

| Relation | Kiểu | Ý nghĩa |
| -------- | ---- | ------- |
| `release` | `ManyToOne Release` | Release gốc |
| `steps` | `OneToMany ReleaseExecutionStep3` | Root/child steps của execution |
| `results` | `OneToMany ReleaseExecutionResult3` | Latest DSP result của execution |
| `releaseErrors` | `OneToMany ReleaseError` | Lỗi gắn với execution |
| `releaseReview` | `OneToOne ReleaseReview` | Review thủ công nếu có |
| `logs` | `OneToMany Logs` | Logs cấp execution |

### Metadata

`metadata.input` là phần quan trọng nhất. Nó giữ snapshot và routing decision tại thời điểm execution bắt đầu.

```ts
metadata: {
  input: {
    releaseSnapshot: Release,
    dspCodes: string[],
    dspDirect: Dsp[],
    dspAggregator: {
      ci: {
        ci: Dsp[],
        state51: Dsp[],
        primaryDsp?: Dsp | null,
        isSkipImport?: boolean,
      }
    },
    delivery?: {
      all?: ReleaseExecutionDeliveryInput,
      directByDspId?: Record<string, ReleaseExecutionDeliveryInput>,
      aggCi?: ReleaseExecutionDeliveryInput,
    },
    upcAutoIfReleaseSnapshotNull?: string,
  }
}
```

Ý nghĩa:

| Metadata | Ý nghĩa |
| -------- | ------- |
| `releaseSnapshot` | Release tại thời điểm submit, dùng để chạy async mà không bị edit sau đó làm lệch |
| `dspCodes` | DSP FE truyền vào |
| `dspDirect` | DSP chạy trực tiếp |
| `dspAggregator.ci.ci` | DSP đi qua CI và có deal |
| `dspAggregator.ci.state51` | DSP đi qua State51 |
| `dspAggregator.ci.primaryDsp` | DSP đại diện dùng để resolve routing config cho CI |
| `dspAggregator.ci.isSkipImport` | Có bỏ qua import CI hay không |
| `delivery.all` | Danh sách DSP để sync delivery toàn execution |
| `delivery.directByDspId` | Delivery input riêng cho từng DSP direct |
| `delivery.aggCi` | Delivery input cho nhóm aggregate CI |
| `upcAutoIfReleaseSnapshotNull` | UPC sinh ra trong execution nếu snapshot ban đầu chưa có UPC |

### `sortSteps()`

Sau khi entity load, `sortSteps()` lọc `steps` chỉ giữ root steps ở top-level:

```text
steps = steps.filter(parentStepId === null).sort(order)
```

Children vẫn nằm trong `childSteps` của từng parent step khi query service build tree.

## 3. `ReleaseExecutionStep3`

File: `entites/release-execution3-step.entity.ts`

Bảng: `release_execution_steps3`

Đây là node của execution tree. Một execution có nhiều step. Một step có thể có nhiều step con.

### Field chính

| Field | Kiểu | Ý nghĩa |
| ----- | ---- | ------- |
| `id` | `uuid` | Khóa chính |
| `releaseExecutionId` | `uuid` | Execution cha |
| `parentStepId` | `uuid | null` | Step cha, null nếu là root step |
| `type` | `ReleaseExecutionStepType` | Loại step |
| `status` | `ReleaseExecutionStepStatus` | Trạng thái step |
| `order` | `int` | Thứ tự chạy trong cùng cấp |
| `metadata` | `jsonb` | Input/output riêng của step |
| `startedAt` | `timestamptz` | Thời điểm step bắt đầu |
| `completedAt` | `timestamptz` | Thời điểm step kết thúc |
| `isDeliveryStep` | `boolean` | Step này có sync DSP result không |
| `childExecutionMode` | `sequential | parallel` | Cách chạy các step con |

### Relation

| Relation | Kiểu | Ý nghĩa |
| -------- | ---- | ------- |
| `releaseExecution` | `ManyToOne ReleaseExecution3` | Execution cha |
| `parentStep` | `ManyToOne ReleaseExecutionStep3` | Parent step |
| `childSteps` | `OneToMany ReleaseExecutionStep3` | Step con |
| `logs` | `OneToMany Logs` | Logs cấp step |
| `releaseErrors` | `OneToMany ReleaseError` | Lỗi gắn với step |
| `results` | `OneToMany ReleaseExecutionResult3` | Result do step này tạo ra |

### `metadata`

`metadata` thường có dạng:

```ts
{
  input: {
    // dữ liệu step cần để chạy
  },
  output: {
    // kết quả step tạo ra
  },
  scheduledAt?: string
}
```

Ví dụ direct DSP:

```ts
{
  input: {
    dsp,
    delivery: {
      releaseId,
      items: [{ dspId, dspCode }]
    }
  }
}
```

Ví dụ `CREATE_METADATA_ON_SERVER` output:

```ts
{
  output: {
    outputDir,
    batchId,
    releaseReference,
    xml
  }
}
```

Ví dụ waiting partner:

```ts
{
  input: { waitMinutes: 60 },
  scheduledAt: "2026-07-07T10:00:00.000Z"
}
```

### `isDeliveryStep`

Nếu `isDeliveryStep = true`, mỗi lần step đổi status engine sẽ thử sync result:

```text
Step status
-> map sang ReleaseDspStatus
-> ReleaseExecution3ResultService.updateExecutionOutputResult()
-> release_execution_results3
-> release_dsp_delivery
```

Không phải parent step nào cũng nên là delivery step. Chỉ set `isDeliveryStep = true` khi status của step đó thật sự phản ánh status của DSP hoặc nhóm DSP.

### `childExecutionMode`

`childExecutionMode = sequential`:

```text
child 1 -> child 2 -> child 3
```

Phù hợp khi child sau phụ thuộc output child trước.

`childExecutionMode = parallel`:

```text
child 1
child 2
child 3
```

Các child cùng chạy bằng `Promise.allSettled()`. Phù hợp với các nhánh DSP độc lập.

### `sortChildSteps()`

Sau khi step load, `sortChildSteps()` sort children theo `order`.

## 4. `ReleaseExecutionResult3`

File: `entites/release-execution3-result.entity.ts`

Bảng: `release_execution_results3`

Entity này giữ latest result theo từng DSP trong một execution. Nó là lớp trung gian giữa execution tree và bảng `release_dsp_delivery`.

### Constraint và index

| Constraint/Index | Ý nghĩa |
| ---------------- | ------- |
| `uq_release_execution_results3_execution_dsp` | Một execution chỉ có một latest result cho mỗi DSP |
| `idx_release_execution_results3_release` | Query theo release |
| `idx_release_execution_results3_step` | Query theo step tạo result |
| `idx_release_execution_results3_status` | Query theo status |

### Field chính

| Field | Kiểu | Ý nghĩa |
| ----- | ---- | ------- |
| `releaseExecutionId` | `uuid` | Execution cha |
| `releaseExecutionStepId` | `uuid | null` | Step tạo/update result |
| `releaseId` | `uuid | null` | Release liên quan |
| `dspId` | `varchar(10)` | DSP |
| `status` | `ReleaseDspStatus` | Latest DSP status trong execution |

### Relation

| Relation | Kiểu | Ý nghĩa |
| -------- | ---- | ------- |
| `releaseExecution` | `ManyToOne ReleaseExecution3` | Execution cha |
| `releaseExecutionStep` | `ManyToOne ReleaseExecutionStep3` | Step tạo result, nullable, `onDelete: SET NULL` |
| `release` | `ManyToOne Release` | Release liên quan |
| `dsp` | `ManyToOne Dsp` | DSP liên quan |

### Vì sao cần bảng result riêng

Không sync trực tiếp từ mọi step sang `release_dsp_delivery` là để có một latest-state nội bộ của execution:

```text
Engine/step
-> release_execution_results3
-> ReleaseDspDeliveryService.updateDeliveryStatus()
-> release_dsp_delivery
```

Lợi ích:

- Mỗi execution có snapshot result riêng.
- Retry/rerun pipeline có nơi upsert latest status.
- UI/debug có thể xem result theo execution/step.
- Có thể sync lại delivery bằng API `sync-output/:id`.
- Tránh mất thông tin step nào tạo ra status.

### Priority status

Service `ReleaseExecution3ResultService` có priority khi upsert result. Các status final như `distributed`, `issues`, `taken_down` được ưu tiên hơn `processing`, `never_distributed`, `draft`. Điều này giúp status final không bị ghi lùi bởi status ít quan trọng hơn trong cùng execution.

## 5. `ReleaseExecution3RunPipelineQueue`

File: `entites/release-execution3.queue.entity.ts`

Bảng: `release_execution3_run_pipeline_queue`

Entity này là DB-backed queue để chạy hoặc rerun pipeline.

### Field chính

| Field | Kiểu | Ý nghĩa |
| ----- | ---- | ------- |
| `releaseExecutionId` | `uuid` | Execution cần chạy pipeline |
| `status` | `RunPipelineQueueStatus` | Status của queue job |
| `attempts` | `int` | Số lần thử |
| `maxAttempts` | `int` | Số lần thử tối đa |
| `error` | `varchar | null` | Lỗi nếu job failed |
| `startedAt` | `timestamp | null` | Thời điểm bắt đầu xử lý |
| `completedAt` | `timestamp | null` | Thời điểm xử lý xong |

### Status

| Status | Ý nghĩa |
| ------ | ------- |
| `NEW` | Job mới, chờ consumer lấy |
| `PROCESSING` | Consumer đang chạy |
| `DONE` | Pipeline run xong |
| `FAILED` | Pipeline lỗi hoặc job bị superseded |

### Khi nào tạo queue job

`queueRunPipeline(executionId)` được gọi khi:

- `startProcessing()` build cây xong.
- Retry một subtree.
- External/admin action update step rồi cần resume.
- Cron thấy `WAITING_PARTNER` đã tới `scheduledAt`.

### Superseded jobs

Consumer group queue theo `releaseExecutionId` và chỉ giữ job mới nhất cho mỗi execution. Các job cũ hơn cùng execution bị set `FAILED` với lý do superseded.

Mục tiêu là gom nhiều tín hiệu resume liên tiếp thành một pipeline run mới nhất.

## 6. `CiDistributionJob3`

File: `entites/ci-distribution-job3.entity.ts`

Bảng: `ci_distribution_jobs3`

Entity này lưu external job của nhánh CI. Step trong execution tạo job rồi trả `WAITING_ACTION`. Sau đó cron/admin/job service xử lý job, rồi update step để pipeline chạy tiếp.

### Field chính

| Field | Kiểu | Ý nghĩa |
| ----- | ---- | ------- |
| `type` | `CiJobType3` | Loại job: `ADMIN_EXPORT`, `EMAIL_STATE51` |
| `upc` | `varchar | null` | UPC/package cần gửi |
| `note` | `varchar | null` | Ghi chú/lỗi |
| `dspCiCodes` | `jsonb` | Danh sách CI code của DSP |
| `releaseExecutionId` | `uuid` | Execution cha |
| `stepId` | `uuid` | Step đang chờ job |
| `releaseId` | `uuid | null` | Release liên quan |
| `status` | `CiJobStatus3` | Status job |
| `deliveryEmail` | `varchar | null` | Email State51 |
| `deliveryEmailSubject` | `varchar | null` | Subject email State51 |
| `sentAt` | `timestamptz | null` | Thời điểm gửi/thành công |
| `nextCiToolCheckAt` | `timestamptz | null` | Lần tiếp theo poll CI Tool |
| `ciToolJobId` | `varchar | null` | Job id bên CI Tool |
| `stepLabel` | `varchar | null` | Label hiển thị cho step/job |

### Relation

| Relation | Kiểu | Ý nghĩa |
| -------- | ---- | ------- |
| `releaseExecution` | `ManyToOne ReleaseExecution3` | Execution cha |
| `step` | `ManyToOne ReleaseExecutionStep3` | Step đang chờ job |
| `release` | `ManyToOne Release` | Release liên quan |

### Status

| Status | Ý nghĩa |
| ------ | ------- |
| `PENDING` | Job đã tạo, chờ cron/admin xử lý |
| `PROCESSING` | Đã gửi email hoặc gửi CI Tool, đang chờ kết quả |
| `COMPLETED` | Job hoàn thành |
| `FAILED` | Job lỗi |
| `CANCEL` | Job bị hủy |

### Luồng job

```text
Worker step
-> create CiDistributionJob3
-> step WAITING_ACTION

CiDistributionJob3Service
-> process job
-> job COMPLETED/FAILED
-> updateStatusStepAndRerunPipeline(stepId, DONE/FAILED)
-> queueRunPipeline(executionId)
```

Ví dụ `ADMIN_EXPORT`:

```text
WAITING_ADMIN_EXPORT
-> create job ADMIN_EXPORT
-> handleDailySend/processJobs
-> export excel
-> send file to CI Tool
-> poll CI Tool
-> finalize step DONE/FAILED
```

Ví dụ `EMAIL_STATE51`:

```text
SEND_EMAIL_STATE51
-> create job EMAIL_STATE51
-> handleDailySend/processJobs
-> group by deliveryEmail
-> export excel
-> send email
-> finalize step DONE/FAILED
```

## 7. Quan hệ dữ liệu theo lifecycle

### Submit

```text
ReleaseService.submit3()
-> ReleaseExecution3Queue.queueExecution()
-> insert release_excutions3 status NEW
```

### Start processing

```text
ReleaseExecution3Service.startProcessing()
-> update execution PROCESSING
-> parseMetadata()
-> update execution.metadata.input
-> create initial ReleaseExecutionResult3
-> ReleaseExecution3Builder.buildStepsChild()
-> insert release_execution_steps3
-> insert release_execution3_run_pipeline_queue NEW
```

### Run pipeline

```text
ReleaseExecution3Consumer.consumeRunPipelineQueue()
-> pick queue job
-> ReleaseExecution3Service.runPipeline()
-> ReleaseExecutionStepEngine.processStep()
-> ReleaseExecution3Worker.dispatchStepTask()
-> update release_execution_steps3.status
```

### Sync result

```text
delivery step status changed
-> ReleaseExecution3ResultService.updateExecutionOutputResult()
-> upsert release_execution_results3
-> ReleaseExecution3ResultService.syncToReleaseDspDelivery()
-> ReleaseDspDeliveryService.updateDeliveryStatus()
```

### Waiting action job

```text
worker creates CiDistributionJob3
-> step WAITING_ACTION
-> job service processes job
-> update step DONE/FAILED
-> queueRunPipeline()
```

## 8. Xóa dữ liệu và cascade

Một số relation dùng `onDelete: CASCADE`:

- Xóa `Release` sẽ cascade execution theo relation `ReleaseExecution3.release`.
- Xóa `ReleaseExecution3` sẽ cascade steps, results, CI jobs.
- Xóa `ReleaseExecutionStep3` sẽ cascade child steps và CI job liên quan.
- `ReleaseExecutionResult3.releaseExecutionStep` dùng `SET NULL`, nên nếu step bị xóa thì result có thể giữ lại nhưng mất link step.

Điều này phù hợp với mô hình execution là dữ liệu con của release, còn result có thể cần giữ latest state theo execution.

## 9. Khi thêm entity mới vào module

Nếu nghiệp vụ cần thêm entity mới, ví dụ job mới ngoài CI hoặc audit riêng, nên xác định rõ entity đó thuộc loại nào:

| Loại entity | Câu hỏi thiết kế |
| ----------- | ---------------- |
| Execution-level | Có gắn trực tiếp với `ReleaseExecution3` không? |
| Step-level | Có gắn với một `ReleaseExecutionStep3` cụ thể không? |
| External job | Có cần status riêng, retry riêng, cron riêng không? |
| Result/projection | Có phải latest state phục vụ sync/UI không? |
| Audit/log | Có cần query riêng hay dùng `Logs` hiện tại đủ? |

Checklist:

```text
1. Tạo entity và migration.
2. Gắn relation với ReleaseExecution3 hoặc ReleaseExecutionStep3 nếu cần.
3. Thêm vào TypeOrmModule.forFeature trong release.module.ts.
4. Nếu có service riêng, thêm provider/controller.
5. Nếu job external cần resume pipeline, lưu stepId + releaseExecutionId.
6. Khi job hoàn tất, gọi updateStatusStepAndRerunPipeline().
7. Nếu entity là result/projection, xác định rule upsert và priority status.
```

## 10. Mental model

Các entity có thể hiểu theo tầng:

```text
release_excutions3
  Lần chạy tổng

release_execution_steps3
  Cây công việc của lần chạy

release_execution_results3
  Latest result từng DSP của lần chạy

release_execution3_run_pipeline_queue
  Tín hiệu chạy/rerun pipeline

ci_distribution_jobs3
  Tác vụ async bên ngoài pipeline, sau khi xong thì resume step
```

Nếu chỉ cần hiểu debug một execution, thứ tự đọc thường là:

```text
1. release_excutions3
2. release_execution_steps3 theo tree
3. logs theo execution/step
4. ci_distribution_jobs3 nếu có WAITING_ACTION
5. release_execution_results3
6. release_dsp_delivery
```
