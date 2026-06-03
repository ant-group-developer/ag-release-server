# Release submit v3 flow

Tai lieu nay mo ta luong hien tai bat dau tu API:

```ts
const result = await this.releaseService.submit3(id, dto);
```

File code chinh:

- `src/modules/release/controllers/release.controller.ts`
- `src/modules/release/services/release.service.ts`
- `src/modules/release/modules/release-executions3/*`
- `src/modules/release/entities/release-dsp-delivery.entity.ts`
- `src/modules/release/modules/release-executions3/entites/ci-distribution-job3.entity.ts`

## 1. FE submit vao BE

Endpoint:

```http
POST /releases/:id/submit
```

Body:

```json
{
	"code": ["SPOTIFY", "APPLE_MUSIC", "YOUTUBE"]
}
```

`code` la danh sach `dsp.code` FE muon submit. BE dung danh sach nay de resolve DSP, chia nhanh direct / aggregator CI, va tao execution.

Controller:

```ts
@Post(':id/submit')
async submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitReleaseDto) {
  const result = await this.releaseService.submit3(id, dto);

  return new ResponseSuccess({
    data: result,
    messageCode: 'common.processing',
  });
}
```

DTO:

```ts
export class SubmitReleaseDto {
	code: string[];
}
```

## 2. ReleaseService.submit3 lam gi

`submit3(id, dto)` thuc hien 3 viec:

1. Load full release snapshot bang `releaseQueryService.findOneReleaseFull({ releaseId: id })`.
2. Update release:

```ts
status: ReleaseStatus.SUBMITTED;
releaseEndDate: null;
```

3. Tao execution v3:

```ts
this.releaseExecution3Service.newReleaseExecution({
	release,
	dspCodes: dto.code,
	type: ExecutionType.INITIAL_RELEASE,
});
```

Luu y: request HTTP khong chay delivery truc tiep. No chi tao job/execution de worker/cron xu ly async.

## 3. Tao execution v3

`ReleaseExecution3Service.newReleaseExecution()` goi:

```ts
queueService.queueExecution(body);
```

`queueExecution` insert vao bang `release_excutions3`:

- `releaseId`
- `releaseTitle`
- `releaseUpc`
- `type = INITIAL_RELEASE`
- `status = NEW`
- `metadata.input.releaseSnapshot`
- `metadata.input.dspCodes`

Sau do cron `ReleaseExecution3Consumer.consumerExecutions` moi phut se lay cac execution `NEW` de start.

Neu cung mot release co nhieu execution `NEW`, consumer chi giu execution moi nhat va cancel cac execution duplicate cu hon.

## 4. Start processing va parse DSP routing

`ReleaseExecution3Service.startProcessing(executionId)`:

1. Chi cho start execution dang `NEW`.
2. Cancel cac pending execution cu hon cua cung release.
3. Set execution `PROCESSING`.
4. Goi `parseMetadata(execution)`.
5. Build step tree bang `ReleaseExecution3Builder.buildStepsChild`.
6. Day job vao `release_execution3_run_pipeline_queue`.

`parseMetadata` resolve `dspCodes` thanh entity `Dsp` kem routing config:

- Direct DSP: DSP khong route qua aggregator CI.
- CI aggregator DSP: `dspRoutingConfig.mode = AGGREGATOR` va `aggregator.code = 'CI'`.
- Trong CI aggregator:
    - `dsp.hasDeal = true` -> nhanh CI admin export.
    - `dsp.hasDeal = false` -> nhanh State51 email.

Metadata sau parse co dang chinh:

```ts
metadata.input.dspDirect;
metadata.input.dspAggregator.ci.ci;
metadata.input.dspAggregator.ci.state51;
metadata.input.dspAggregator.ci.primaryDsp;
metadata.input.delivery.all;
metadata.input.delivery.directByDspId;
metadata.input.delivery.aggCi;
```

`delivery.*` la input de sync status sang `release_dsp_delivery`.

## 5. Step tree duoc build nhu the nao

Root steps:

1. `GEN_UPC` neu release snapshot chua co UPC.
2. `GEN_ISRCS` neu co track chua co ISRC.
3. `VALIDATE`.
4. `PROCESS_DSPS`, chay parallel, `isDeliveryStep = true`.

Nhanh direct:

```text
PROCESS_DSPS
  PROCESS_DIRECT
    PROCESS_DIRECT_CHILD (isDeliveryStep = true, theo tung DSP direct)
      CREATE_METADATA_ON_SERVER
      UPLOAD_METADATA_TO_SFTP
      WAIT_PARTNER_PROCESS
      SYNC_DATA_PARTNER
```

Nhanh aggregator CI:

```text
PROCESS_DSPS
  PROCESS_AGG
    PROCESS_AGG_CI (isDeliveryStep = true, cho group CI)
      IMPORT_CI
        CREATE_METADATA_ON_SERVER
        UPLOAD_METADATA_TO_SFTP
        CREATE_FOLDER_DONE_CI
        WAIT_PARTNER_PROCESS
        VALIDATE_QA_CI
      EXPORT_CI
        EXPORT_CI_CI
          WAITING_ADMIN_EXPORT
        EXPORT_CI_STATE51
          SEND_EMAIL_STATE51
```

`childExecutionMode`:

- Default la `sequential`.
- `PROCESS_DSPS`, `PROCESS_DIRECT`, `EXPORT_CI` duoc set `parallel`.

Trong code hien tai, parallel branch van duoc lap lan luot trong mot process, nhung status logic coi nhu cac branch doc lap.

## 6. Engine chay step va status step

`ReleaseExecution3Consumer.consumeRunPipelineQueue` moi 30 giay lay job trong `release_execution3_run_pipeline_queue` va goi:

```ts
ReleaseExecution3Service.runPipeline(executionId);
```

`runPipeline` load execution tree va goi `ReleaseExecutionStepEngine.processStep`.

Step status:

- `NEW`
- `PROCESSING`
- `WAITING_ACTION`
- `WAITING_PARTNER`
- `DONE`
- `FAILED`
- `SKIPPED`
- `CANCELLED`

Neu step leaf:

1. Set `PROCESSING`.
2. Dispatch sang `ReleaseExecution3Worker.dispatchStepTask`.
3. Luu status tra ve.

Neu step cha:

1. Set `PROCESSING`.
2. Chay children theo `sequential` hoac `parallel`.
3. Derive status tu children.

Sequential se dung neu child tra ve:

- `FAILED`
- `WAITING_ACTION`
- `WAITING_PARTNER`
- `CANCELLED`

## 7. Sync status voi release_dsp_delivery

Bang `release_dsp_delivery` la bang status theo tung release + DSP.

Entity field quan trong:

- `releaseId`
- `dspId`
- `status`
- `isSelected`
- `lastEnqueuedAt`
- `lastDeliveredAt`
- `logs`
- `issues`
- `metadataPath`
- `batchId`

Status delivery:

- `draft`
- `processing`
- `issues`
- `never_distributed`
- `distributed`
- `taken_down`

Sync tu execution v3 nam o `ReleaseExecutionStepEngine.updateStepStatus`.

Moi khi step update status, engine goi:

```ts
syncDeliveryStatusByStepStatus(step, status);
```

Chi step co `isDeliveryStep = true` moi sync. Mapping:

| Execution step    | Step status                        | Delivery status |
| ----------------- | ---------------------------------- | --------------- |
| `PROCESS_DSPS`    | `PROCESSING`                       | `processing`    |
| Any delivery step | `DONE`                             | `distributed`   |
| Any delivery step | `FAILED` / `CANCELLED` / `SKIPPED` | `issues`        |

Delivery data lay tu:

```ts
step.metadata.input.delivery.releaseId
step.metadata.input.delivery.items[].dspId
```

Sau do `ReleaseDspDeliveryService.updateDeliveryStatus` upsert theo unique key `(release_id, dsp_id)`.

Khi status la `processing`:

- `lastEnqueuedAt = now`
- `lastDeliveredAt = null`

Khi status la `distributed`:

- `lastDeliveredAt = now`

## 8. Sync release.status tu release_dsp_delivery

Endpoint:

```http
POST /releases/:id/sync-release-status
```

Controller goi:

```ts
releaseService.syncReleaseStatus(id);
```

Hien tai ham nay dung lai logic cu:

```ts
releaseSubmitService2.deriveAndUpdateReleaseStatus(releaseId);
```

Logic nay doc tat ca `release_dsp_delivery` cua release, bo qua `never_distributed`, roi derive release status:

| Delivery statuses                                    | Release status |
| ---------------------------------------------------- | -------------- |
| Khong co delivery nao ngoai `never_distributed`      | `processing`   |
| Tat ca `distributed`                                 | `distributed`  |
| Tat ca `issues`                                      | `failed`       |
| Co `processing`                                      | `processing`   |
| Mix `distributed` + `issues`, khong con `processing` | `partial_done` |

Co case dac biet trong service cu: neu submit status la `WAITING_ACTION` va delivery con `processing` thi release = `awaiting_action`. Endpoint sync hien tai khong truyen submit status, nen case nay khong tu kich hoat qua endpoint nay.

Luu y quan trong: trong v3, execution engine dang sync delivery status, nhung code hien tai khong thay `runPipeline` tu dong goi `deriveAndUpdateReleaseStatus` sau khi execution ket thuc. Vi vay release.status co the can endpoint sync rieng hoac can bo sung hook tu v3 de sync tu dong.

## 9. Logic lay QA flag tu CI

Endpoint manual:

```http
GET /releases/:id/qa-flag-ci
```

Service:

```ts
releaseService.getQaFlagCi(id);
```

Flow:

1. Load release theo id.
2. Goi CI API list releases voi UPC:

```ts
ciService.getReleases({
	gtin: release.upc ? [release.upc] : [],
});
```

3. Tim CI release id:

```ts
resListReleaseCi._embedded.find((item) => item.barcode === release.upc)?.id;
```

4. Neu khong tim thay thi throw:

```text
Khong tim thay CI
```

5. Goi:

```ts
ciService.getReleaseQaFlags(idCi);
```

6. Return:

```ts
res2._embedded;
```

CI endpoint duoc goi:

```http
GET /releases/v1/organisations/:organisationId/releases?gtin=:upc
GET /releases/v1/organisations/:organisationId/releases/:ciReleaseId/metadata/qa_flags
```

Trong pipeline v3, QA flag duoc check o step `VALIDATE_QA_CI`, sau cac step import CI:

```text
CREATE_METADATA_ON_SERVER
UPLOAD_METADATA_TO_SFTP
CREATE_FOLDER_DONE_CI
WAIT_PARTNER_PROCESS
VALIDATE_QA_CI
```

`VALIDATE_QA_CI`:

- Goi `releaseService.getQaFlagCi(releaseId)`.
- Luu `qaFlags` va `hasIssues` vao `step.metadata.output`.
- Neu `qaFlags.length > 0` thi throw error va step = `FAILED`.
- Neu khong co flag thi step = `DONE`.

Anh huong status:

- QA pass -> nhanh import CI tiep tuc export.
- QA co issue -> `VALIDATE_QA_CI` failed -> parent CI branch failed -> delivery CI group bi mark `issues`.

## 10. CI export job va State51 job

Sau `IMPORT_CI` pass QA, pipeline vao `EXPORT_CI`.

### CI admin export

Cho DSP CI aggregator co `hasDeal = true`:

```text
EXPORT_CI
  EXPORT_CI_CI
    WAITING_ADMIN_EXPORT
```

`WAITING_ADMIN_EXPORT` tao record `ci_distribution_jobs3`:

- `type = ADMIN_EXPORT`
- `status = PENDING`
- `upc`
- `dspCiCodes`
- `releaseExecutionId`
- `stepId`
- `releaseId`
- `stepLabel = Export CI - Admin Export`

Step tra ve `WAITING_ACTION`, tuc pipeline dung cho den khi job duoc xu ly.

`CiDistributionJob3Service.handleDailySend` chay theo cron `config.partners.ci.dailySendCron` hoac default `0 8 * * *`.

Voi job `ADMIN_EXPORT`:

1. Tao file Excel tu `{ upc, listCodeDspCi }`.
2. Goi CI Tool:

```ts
ciToolService.sendFileExportToCi(...)
```

3. Luu:

```ts
status = PROCESSING
ciToolJobId
nextCiToolCheckAt = now + 5 minutes
```

Cron `handleCheckCiToolJobStatus` moi 10 giay check cac job den lich:

- CI Tool `success` -> job `COMPLETED`, step `DONE`, rerun pipeline.
- CI Tool `failed` -> job `FAILED`, note message. Code hien tai dang set step `DONE` trong branch failed, nhung log ghi "step FAILED". Day la diem can confirm/kiem tra lai vi co ve khong khop intent.
- Dang processing -> day `nextCiToolCheckAt` them 1 phut.
- Loi khi check -> day `nextCiToolCheckAt` them 5 phut.

### State51 email

Cho DSP CI aggregator co `hasDeal = false`:

```text
EXPORT_CI
  EXPORT_CI_STATE51
    SEND_EMAIL_STATE51
```

`SEND_EMAIL_STATE51` tao record `ci_distribution_jobs3`:

- `type = EMAIL_STATE51`
- `status = PENDING`
- `upc`
- `dspCiCodes`
- `deliveryEmail`
- `deliveryEmailSubject`
- `releaseExecutionId`
- `stepId`
- `releaseId`
- `stepLabel = Export CI - Email State51`

Email lay tu aggregator config:

```ts
dspRoutingConfig.aggregator.deliveryEmail;
dspRoutingConfig.aggregator.deliveryEmailSubject;
```

Step tra ve `WAITING_ACTION`.

Khi daily send xu ly `EMAIL_STATE51`:

1. Group job theo `deliveryEmail`.
2. Tao Excel attachment.
3. Gui email qua `NotificationResendService`.
4. Neu gui thanh cong: job `COMPLETED`, `sentAt = now`.
5. Set step `NEW` va rerun pipeline.

Luu y: set step `NEW` nghia la step `SEND_EMAIL_STATE51` co the chay lai. Code co check `step.metadata.output.jobCreated` de tranh tao duplicate job.

## 11. API lien quan cho leader/ops

Release:

- `POST /releases/:id/submit`
- `GET /releases/:id/qa-flag-ci`
- `POST /releases/:id/sync-release-status`
- `GET /releases/:id/list-code-export-ci`
- `GET /releases/:id/record-export-ci`
- `GET /releases/:id/file-export-ci`

Execution v3:

- Controller nam trong `release-executions3/controllers`.
- Dung de xem execution, retry/update step tuy endpoint chi tiet can check controller.

CI distribution jobs:

- `GET /ci-distribution-jobs`
- `GET /ci-distribution-jobs/grouped`
- `GET /ci-distribution-jobs/:id`
- `POST /ci-distribution-jobs/daily-send`
- `POST /ci-distribution-jobs/download-excel`
- `POST /ci-distribution-jobs/confirm-completed`
- `PUT /ci-distribution-jobs/:id`

## 12. Bang DB chinh

`releases`:

- `status`
- `upc`
- `release_end_date`
- `metadata_ci`
- `metadata_spotify`

`release_dsp_delivery`:

- Status tung DSP cua release.
- Unique `(release_id, dsp_id)`.
- La nguon de derive release.status.

`release_excutions3`:

- Execution cha.
- Luu release snapshot va input dsp codes trong `metadata`.

`release_execution_steps3`:

- Cay step.
- `is_delivery_step` quyet dinh step co sync sang delivery hay khong.
- `metadata.input/output` luu input, output, schedule, QA flags.

`release_execution3_run_pipeline_queue`:

- Queue noi bo de rerun pipeline async.

`ci_distribution_jobs3`:

- Job can action cho CI admin export hoac State51 email.
- Lien ket nguoc ve execution step bang `step_id`.

## 13. Cac diem can confirm voi team

1. `submit3` update release sang `submitted`, nhung v3 khong thay auto update sang `processing` khi execution start. Neu UI can status release realtime, nen bo sung sync release status trong v3.
2. `syncReleaseStatus` hien dung logic cu va khong biet execution v3 dang `WAITING_ACTION`, nen co the khong set `awaiting_action`.
3. Trong `CiDistributionJob3Service.checkCiToolJobStatus`, branch CI Tool `failed` log "step FAILED" nhung code dang update step `DONE`. Can confirm day la bug hay intentional.
4. `deriveStatusFromChildren` trong worker dang return `DONE`, nhung status parent thuc te duoc engine derive lai tu child sau khi chay. Nen nen doc engine la source of truth cho parent status.
5. `getQaFlagCi` phu thuoc UPC va CI release barcode match UPC. Neu release chua co UPC hoac CI chua import xong, QA check se fail "Khong tim thay CI".
