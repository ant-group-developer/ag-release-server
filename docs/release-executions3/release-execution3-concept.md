# Release Execution 3 - Concept

File này mô tả ý tưởng thiết kế của module `release-executions3`: một lần submit release tạo ra một cây execution, cây này tự chia nhỏ danh sách DSP thành các nhánh xử lý, rồi engine duyệt cây để chạy từng step.

## 1. Ý tưởng chính

Input của module là một release và một mảng DSP:

```ts
{
  release: Release,
  dspCodes: string[],
  type: INITIAL_RELEASE | UPDATE | TAKEDOWN | RETRY
}
```

Từ input này, hệ thống tạo ra một `ReleaseExecution3`. Một execution đại diện cho một lần chạy phân phối release.

Một execution có nhiều step. Một step có thể có nhiều step con. Vì vậy execution không phải là một list phẳng, mà là một cây.

```text
ReleaseExecution3
└── Step
    ├── Step con
    │   ├── Step cháu
    │   └── Step cháu
    └── Step con
```

Mục tiêu của cây là chia nhỏ bài toán lớn "phân phối release tới nhiều DSP" thành các cụm nhỏ hơn:

- Cụm generate UPC/ISRC.
- Cụm validate release.
- Cụm xử lý DSP direct.
- Cụm xử lý DSP đi qua aggregator.
- Cụm xử lý CI import/export.
- Cụm chờ partner hoặc chờ admin action.

## 2. DSP được chia nhánh như thế nào

FE truyền vào một mảng DSP. Khi execution bắt đầu, `parseMetadata()` phân loại DSP thành các nhóm:

```text
dspCodes[]
├── Direct DSP
└── Aggregator DSP
    └── CI
        ├── CI deal
        └── State51
```

Ý tưởng là mỗi nhóm DSP có cách xử lý khác nhau, nên cây cũng tách thành các nhánh khác nhau.

Ví dụ:

```text
PROCESS_DSPS
├── PROCESS_DIRECT
│   ├── PROCESS_DIRECT_CHILD: Spotify
│   ├── PROCESS_DIRECT_CHILD: Vevo
│   └── PROCESS_DIRECT_CHILD: DSP khác
└── PROCESS_AGG
    └── PROCESS_AGG_CI
        ├── IMPORT_CI
        ├── EXPORT_CI
        │   ├── EXPORT_CI_CI
        │   └── EXPORT_AGG_CI_STATE51
        ├── WAIT_PARTNER_PROCESS
        └── SYNC_DATA_DSP_CI
```

Direct DSP thường được tách từng DSP thành một nhánh riêng vì mỗi DSP có thể upload, chờ response và sync status độc lập.

Aggregator DSP thường được gom nhóm vì nhiều DSP cùng đi qua một đường xử lý chung, ví dụ CI.

## 3. Builder chỉ build cây

`ReleaseExecution3Builder` chỉ có nhiệm vụ sinh cây step và lưu DB.

Builder không generate UPC, không upload SFTP, không gọi CI, không gửi mail.

Nó chỉ trả lời câu hỏi:

```text
Với execution này, cần những step nào?
Step nào là con của step nào?
Step con chạy tuần tự hay song song?
Step nào là delivery step?
Metadata input của từng step là gì?
```

Một số rule build cây:

- Root level có thể có `GEN_UPC`, `GEN_ISRCS`, `VALIDATE`, `PROCESS_DSPS`.
- `GEN_ISRCS` tách thành nhiều `GEN_ISRC`, mỗi track/video một step.
- `PROCESS_DSPS` tách thành `PROCESS_DIRECT` và `PROCESS_AGG`.
- `PROCESS_DIRECT` tách thành nhiều `PROCESS_DIRECT_CHILD`, mỗi DSP một step.
- `PROCESS_AGG` hiện build nhánh `PROCESS_AGG_CI`.
- `PROCESS_AGG_CI` build các step import/export/wait/sync của CI.
- `EXPORT_CI` tách thành nhánh CI deal và State51.

## 4. Mỗi step có gì

Một step là một node trong cây. Các field quan trọng:

| Field                | Ý nghĩa |
| -------------------- | ------- |
| `type`               | Step này làm việc gì, ví dụ `VALIDATE`, `PROCESS_DIRECT_CHILD`, `UPLOAD_METADATA_TO_SFTP` |
| `status`             | Trạng thái hiện tại của step |
| `parentStepId`       | Step cha |
| `childSteps`         | Danh sách step con |
| `order`              | Thứ tự trong cùng cấp |
| `childExecutionMode` | Cách chạy các step con: `sequential` hoặc `parallel` |
| `metadata.input`     | Input riêng của step |
| `metadata.output`    | Output riêng của step |
| `isDeliveryStep`     | Step này có sync result về DSP delivery hay không |

`metadata.input` giúp step biết nó cần xử lý cái gì. Ví dụ direct child giữ DSP cụ thể, CI sync giữ danh sách `dspCiCodes`, delivery step giữ danh sách DSP cần sync status.

`metadata.output` giúp step sau đọc lại kết quả step trước. Ví dụ `UPLOAD_METADATA_TO_SFTP` đọc `outputDir` từ `CREATE_METADATA_ON_SERVER`.

## 5. Engine xử lý cây

Sau khi builder build xong cây, engine bắt đầu xử lý.

Ý tưởng xử lý là duyệt cây theo kiểu đệ quy:

```text
processStep(step):
  nếu step không có con:
    chạy worker task của step
    trả status của step

  nếu step có con:
    chạy các step con theo childExecutionMode
    resolve status của step cha từ status các con
    trả status của step cha
```

Nói cách khác, status của step cha không tự quyết định một cách độc lập. Nó phụ thuộc vào status của các step con.

Ví dụ:

```text
PROCESS_DIRECT
├── PROCESS_DIRECT_CHILD Spotify: DONE
├── PROCESS_DIRECT_CHILD Vevo: FAILED
└── PROCESS_DIRECT_CHILD DSP khác: DONE

=> PROCESS_DIRECT: FAILED
```

Vì có một child failed, parent được resolve thành `FAILED`.

## 6. Sequential và parallel

Mỗi step có `childExecutionMode`.

Nếu là `sequential`, các step con chạy từ trên xuống theo `order`.

```text
CREATE_METADATA_ON_SERVER
-> UPLOAD_METADATA_TO_SFTP
-> WAIT_PARTNER_PROCESS
-> SYNC_DATA_PARTNER
```

Nhánh sequential phù hợp khi step sau phụ thuộc output của step trước. Ví dụ upload cần metadata đã tạo trước đó.

Nếu là `parallel`, các step con được chạy cùng lúc bằng `Promise.allSettled()`.

```text
PROCESS_DIRECT
├── PROCESS_DIRECT_CHILD Spotify
├── PROCESS_DIRECT_CHILD Vevo
└── PROCESS_DIRECT_CHILD DSP khác
```

Nhánh parallel phù hợp khi các child cùng cấp độc lập với nhau. Kết quả của DSP này không cần chặn DSP khác.

Lưu ý: parallel ở đây là chạy các nhánh cùng cấp cùng lúc trong runtime hiện tại. Nó không có nghĩa là có distributed worker riêng cho từng nhánh.

## 7. Status bubble-up

Sau khi các child chạy xong, parent lấy status từ child.

Rule hiện tại trong engine:

| Điều kiện child | Status parent |
| --------------- | ------------- |
| Có `WAITING_ACTION` | `WAITING_ACTION` |
| Có `WAITING_PARTNER` | `WAITING_PARTNER` |
| Có `FAILED` | `FAILED` |
| Có `CANCELLED` | `CANCELLED` |
| Có `PROCESSING` | `PROCESSING` |
| Tất cả `DONE` hoặc `SKIPPED` | `DONE` |
| Còn lại | `NEW` |

Status cứ bubble-up như vậy cho tới root step. Sau đó execution tổng được derive lại từ các root step.

## 8. Khi nào pipeline dừng

Với nhánh sequential, nếu một child trả về một trong các status sau thì parent dừng xử lý tiếp:

- `FAILED`
- `CANCELLED`
- `WAITING_ACTION`
- `WAITING_PARTNER`

Ví dụ:

```text
IMPORT_CI
├── CREATE_METADATA_ON_SERVER: DONE
├── UPLOAD_METADATA_TO_SFTP: DONE
├── CREATE_FOLDER_DONE_CI: DONE
├── WAIT_PARTNER_PROCESS: WAITING_PARTNER
├── GET_RESULT_IMPORT_CI: NEW
└── VALIDATE_QA_CI: NEW
```

Khi gặp `WAITING_PARTNER`, engine dừng nhánh này. Các step phía sau chưa chạy. Cron sẽ resume sau khi tới `scheduledAt`.

Với nhánh parallel, các child cùng cấp không chặn nhau theo kiểu tuần tự. Engine chạy hết các child bằng `Promise.allSettled()`, rồi mới resolve status cha.

## 9. Worker chỉ xử lý leaf task

`ReleaseExecution3Worker` là nơi thực hiện công việc thật của leaf step.

Ví dụ:

- `GEN_UPC`: gọi service cấp UPC.
- `GEN_ISRC`: gọi service cấp ISRC cho track/video.
- `VALIDATE`: validate release snapshot.
- `CREATE_METADATA_ON_SERVER`: tạo DDEX metadata.
- `UPLOAD_METADATA_TO_SFTP`: upload metadata.
- `WAIT_PARTNER_PROCESS`: set `scheduledAt` và trả `WAITING_PARTNER`.
- `SYNC_DATA_PARTNER`: đọc response partner, ví dụ VEVO.
- `VALIDATE_QA_CI`: check QA flag trên CI.
- `WAITING_ADMIN_EXPORT`: tạo CI job và trả `WAITING_ACTION`.
- `SEND_EMAIL_STATE51`: tạo CI email job và trả `WAITING_ACTION`.
- `SYNC_DATA_DSP_CI`: lấy status DSP từ CI.

Các step cha như `PROCESS_DSPS`, `PROCESS_DIRECT`, `PROCESS_AGG_CI` chủ yếu tồn tại để gom nhóm và resolve status từ con.

## 10. Delivery result

Không phải step nào cũng sync status về DSP delivery.

Chỉ step có `isDeliveryStep = true` mới được engine dùng để tạo result.

Luồng sync:

```text
Step isDeliveryStep đổi status
-> Engine map step status sang ReleaseDspStatus
-> ReleaseExecution3ResultService.updateExecutionOutputResult()
-> upsert release_execution_results3
-> syncToReleaseDspDelivery()
-> ReleaseDspDeliveryService.updateDeliveryStatus()
```

Step `DONE` thường map thành DSP `distributed`.

Step `FAILED`, `CANCELLED`, `SKIPPED` thường map thành DSP `issues`.

Các status trung gian như `PROCESSING`, `WAITING_ACTION`, `WAITING_PARTNER` không tự động map sang delivery status trong engine hiện tại.

## 11. Resume pipeline

Pipeline không resume bằng cách gọi đúng step kế tiếp.

Thay vào đó, hệ thống enqueue lại `run_pipeline` cho cả execution:

```text
queueRunPipeline(executionId)
-> load lại cây
-> duyệt lại từ root
-> bỏ qua step đã DONE/FAILED/CANCELLED/WAITING_ACTION
-> chạy tiếp các step còn có thể chạy
```

Cách này làm resume đơn giản hơn. Các nguồn resume gồm:

- Cron thấy `WAITING_PARTNER` đã tới `scheduledAt`.
- Admin hoặc CI job update step từ `WAITING_ACTION` sang `DONE` hoặc `FAILED`.
- User retry một subtree.

## 12. Retry subtree

Retry không reset toàn bộ execution.

Khi retry một step:

```text
retryStep(stepId)
-> set step và toàn bộ descendants về NEW
-> clear startedAt/completedAt
-> clear metadata.output
-> queueRunPipeline(executionId)
```

Những nhánh khác nếu đã `DONE` thì engine sẽ bỏ qua. Đây là lý do cây step hữu ích: có thể retry đúng nhánh lỗi thay vì chạy lại cả release.

## 13. Khi nghiệp vụ cần thêm step mới

Thiết kế dạng cây giúp thêm nghiệp vụ mới bằng cách gắn thêm node vào đúng vị trí, thay vì sửa một luồng submit tuyến tính dài. Khi cần thêm step, hãy nghĩ theo 4 câu hỏi:

```text
1. Step này nằm ở đâu trong cây?
2. Step này là leaf task hay chỉ là parent gom nhóm?
3. Các step con của nó chạy sequential hay parallel?
4. Step này chạy xong ngay, chờ partner, hay chờ admin/external job?
```

### 13.1 Thêm một step xử lý bình thường

Một step xử lý bình thường là step có thể chạy ngay trong worker và trả về status cuối cùng như `DONE` hoặc `FAILED`.

Ví dụ muốn thêm step `CHECK_METADATA_POLICY` sau `VALIDATE`:

```text
VALIDATE
-> CHECK_METADATA_POLICY
-> PROCESS_DSPS
```

Các phần thường cần sửa:

| Nơi sửa | Việc cần làm |
| ------- | ------------ |
| `ReleaseExecutionStepType` | Thêm enum `CHECK_METADATA_POLICY` |
| `ReleaseExecution3Builder` | Insert step vào đúng vị trí, set `order` |
| `ReleaseExecution3Worker.dispatchStepTask()` | Thêm case dispatch |
| Worker private method | Viết logic xử lý, trả `DONE` hoặc `FAILED` |
| Docs/test nếu có | Mô tả step mới và kỳ vọng status |

Nếu step sau phụ thuộc output của step trước, đặt chúng trong cùng một parent có `childExecutionMode = sequential`.

Nếu step mới độc lập với các step cùng cấp, có thể đặt trong parent `parallel`.

### 13.2 Thêm step cha để gom nhóm

Không phải step nào cũng cần làm nghiệp vụ thật. Có những step chỉ tồn tại để gom nhóm con và resolve status.

Ví dụ:

```text
PROCESS_NEW_AGG
├── IMPORT_NEW_AGG
├── EXPORT_NEW_AGG
└── SYNC_NEW_AGG_RESULT
```

`PROCESS_NEW_AGG` có thể không cần worker logic thật. Nó chỉ cần:

- Builder tạo các child step.
- Engine chạy child theo `childExecutionMode`.
- Parent tự resolve status từ child.

Trong worker, những parent step kiểu này thường chỉ trả `DONE` nếu bị gọi như leaf, nhưng thực tế nó có child nên engine sẽ xử lý child trước và resolve parent.

### 13.3 Thêm review release

`REVIEW_RELEASE` là ví dụ của step chờ thao tác thủ công.

Ý tưởng:

```text
VALIDATE
-> REVIEW_RELEASE
-> PROCESS_DSPS
```

Khi tới `REVIEW_RELEASE`, worker không thể tự quyết định release pass/fail ngay. Nó tạo hoặc lấy một `ReleaseReview`, gắn `stepId`, rồi trả về `WAITING_ACTION`.

```text
REVIEW_RELEASE
-> create/find ReleaseReview
-> save releaseExecutionId + stepId
-> return WAITING_ACTION
```

Pipeline dừng ở đây. Sau đó admin review:

```text
Admin approve/reject
-> ReleaseReviewService.handleResultReviewRelease()
-> updateStatusStepAndRerunPipeline(stepId, DONE hoặc FAILED)
-> queueRunPipeline(executionId)
```

Nếu admin approve, step được set `DONE`, pipeline chạy tiếp sang step sau.

Nếu admin reject, step được set `FAILED`, parent/root sẽ bubble-up thành failed.

Để bật review release vào luồng, cần:

| Nơi sửa | Việc cần làm |
| ------- | ------------ |
| `ReleaseExecution3Builder` | Thêm `REVIEW_RELEASE` vào root, thường sau `VALIDATE` và trước `PROCESS_DSPS` |
| `ReleaseExecution3Worker` | Đã có `reviewRelease()` tạo review và trả `WAITING_ACTION` |
| `ReleaseReviewService` | Đã có logic update step `DONE` hoặc `FAILED` rồi rerun pipeline |
| UI/Admin API | Cần màn hoặc action để approve/reject review |

Step review nên là sequential với các step phía sau, vì không nên phân phối DSP khi release chưa được duyệt.

### 13.4 Thêm step tạo CI job hoặc external job

CI job là ví dụ của step không tự hoàn tất ngay trong pipeline. Step chỉ tạo job, rồi chờ một service khác xử lý.

Ví dụ hiện tại:

```text
EXPORT_AGG_CI_CI
└── WAITING_ADMIN_EXPORT

EXPORT_AGG_CI_STATE51
└── SEND_EMAIL_STATE51
```

Khi worker chạy các step này:

```text
WAITING_ADMIN_EXPORT
-> create CiDistributionJob3(type = ADMIN_EXPORT)
-> metadata.output.jobCreated = true
-> return WAITING_ACTION
```

hoặc:

```text
SEND_EMAIL_STATE51
-> create CiDistributionJob3(type = EMAIL_STATE51)
-> metadata.output.jobCreated = true
-> return WAITING_ACTION
```

Pipeline dừng ở `WAITING_ACTION`. Sau đó job service xử lý:

```text
CiDistributionJob3Service.processJobs()
-> gửi file/email/external API
-> nếu success: update job COMPLETED, step DONE
-> nếu failed: update job FAILED, step FAILED
-> updateStatusStepAndRerunPipeline()
```

Khi cần thêm một loại external job mới, ví dụ `SEND_TO_PARTNER_X`, thường cần:

| Nơi sửa | Việc cần làm |
| ------- | ------------ |
| `ReleaseExecutionStepType` | Thêm step type, ví dụ `SEND_TO_PARTNER_X` |
| `CiJobType3` hoặc job enum riêng | Thêm job type nếu dùng bảng job |
| `ReleaseExecution3Builder` | Gắn step mới vào nhánh phù hợp |
| `ReleaseExecution3Worker` | Step tạo job, set `jobCreated`, return `WAITING_ACTION` |
| Job service | Xử lý job pending/processing, gọi external service |
| Job finalize | Khi xong gọi `updateStatusStepAndRerunPipeline(stepId, DONE/FAILED)` |
| Controller/Admin UI | Nếu job cần thao tác admin, thêm API/UI tương ứng |

Nguyên tắc quan trọng: step tạo job phải idempotent.

Vì pipeline có thể rerun nhiều lần, worker cần check `metadata.output.jobCreated`. Nếu đã tạo job rồi thì không tạo duplicate, chỉ tiếp tục trả `WAITING_ACTION`.

```text
if (!step.metadata?.output?.jobCreated) {
  createJob()
  step.metadata.output.jobCreated = true
}

return WAITING_ACTION
```

### 13.5 Thêm nhánh aggregator mới

Nếu có aggregator mới ngoài CI, ví dụ `AGG_X`, đừng nhét tất cả logic vào nhánh CI. Nên thêm nhánh riêng.

Ý tưởng cây:

```text
PROCESS_DSPS
├── PROCESS_DIRECT
└── PROCESS_AGG
    ├── PROCESS_AGG_CI
    └── PROCESS_AGG_X
        ├── IMPORT_AGG_X
        ├── EXPORT_AGG_X
        ├── WAIT_PARTNER_PROCESS
        └── SYNC_DATA_AGG_X
```

Các phần cần mở rộng:

| Nơi sửa | Việc cần làm |
| ------- | ------------ |
| `parseMetadata()` | Phân loại DSP vào nhóm aggregator mới |
| `ReleaseExecution3.metadata.input` | Thêm field metadata cho nhóm mới |
| `ReleaseExecution3Builder` | Build nhánh `PROCESS_AGG_X` và các child |
| `ReleaseExecution3Worker` | Thêm task import/export/sync riêng |
| Delivery metadata | Chuẩn bị `delivery` input cho nhóm aggregator mới |
| Result sync | Nếu step sync delivery, set `isDeliveryStep = true` và output result đúng DSP |

Rule chọn `childExecutionMode`:

- Nếu import phải xong trước export, dùng `sequential`.
- Nếu export chia nhiều nhóm độc lập, dùng `parallel` ở parent export.
- Nếu sync result cần chờ partner, đặt `WAIT_PARTNER_PROCESS` trước step sync.

### 13.6 Thêm step delivery

Một step delivery là step có kết quả ảnh hưởng tới status DSP.

Khi thêm step delivery, cần set:

```ts
isDeliveryStep: true
metadata: {
  input: {
    delivery: {
      releaseId,
      items: [{ dspId, dspCode }]
    }
  }
}
```

Nếu worker trả output chi tiết từng DSP, ghi vào:

```ts
step.metadata.output.result = [
  { dspId, dspCode, status },
]
```

Engine sẽ ưu tiên `metadata.output.result` theo `dspCode`. Nếu output không có item nào, engine fallback status theo step:

```text
DONE -> distributed
FAILED/CANCELLED/SKIPPED -> issues
```

Không nên set `isDeliveryStep = true` cho step parent quá sớm nếu parent `DONE` chưa có nghĩa là DSP đã distributed thật.

### 13.7 Checklist thêm step mới

Checklist ngắn:

```text
1. Thêm enum step type.
2. Xác định vị trí trong builder.
3. Xác định parent chạy sequential hay parallel.
4. Nếu là leaf, thêm worker dispatch + method xử lý.
5. Nếu là waiting action, tạo record external/review/job và return WAITING_ACTION.
6. Nếu là waiting partner, lưu scheduledAt và return WAITING_PARTNER.
7. Nếu cần resume, gọi updateStatusStepAndRerunPipeline hoặc queueRunPipeline.
8. Nếu ảnh hưởng DSP delivery, set isDeliveryStep và metadata.input.delivery.
9. Đảm bảo step idempotent vì pipeline có thể rerun nhiều lần.
10. Update docs/test/debug query nếu cần.
```

## 14. Mental model ngắn

Có thể hiểu module này như sau:

```text
Input: 1 release + nhiều DSP

Builder:
  chia DSP thành các nhóm
  build thành cây step

Engine:
  duyệt cây đệ quy
  chạy child theo sequential hoặc parallel
  resolve status cha từ status con

Worker:
  chạy nghiệp vụ thật ở leaf step

Result service:
  gom latest result từng DSP
  sync sang release_dsp_delivery

Queue/Cron:
  start execution
  rerun pipeline
  resume waiting step
  resume sau external job
```

Điểm quan trọng nhất: release execution v3 không coi submit là một chuỗi hard-code tuyến tính. Nó coi submit là một cây công việc có thể tách nhánh, chờ, retry từng nhánh, và tổng hợp status ngược từ lá lên gốc.
