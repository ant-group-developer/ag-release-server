# Release execution v3 - giai thich nghiep vu

Tai lieu nay giai thich luong xu ly 1 release theo execution v3 o muc nghiep vu/architecture, de leader nam duoc y tuong chinh truoc khi doc code chi tiet.

## 1. Tong quan

Khi FE submit 1 release, FE truyen vao danh sach DSP code can deliver:

```json
{
	"code": ["SPOTIFY", "VEVO", "TIKTOK", "APPLE_MUSIC"]
}
```

BE khong xu ly tat ca trong request submit. BE tao 1 `ReleaseExecution3`, luu snapshot release va input DSP vao `execution.metadata`, sau do worker/cron se xu ly async.

Flow ngan gon:

```text
FE submit
  -> ReleaseService.submit3
  -> ReleaseExecution3Service.newReleaseExecution
  -> tao execution status NEW
  -> consumer start execution
  -> parseMetadata
  -> builder build cay step
  -> engine dieu huong step cha/con
  -> worker xu ly nghiep vu tung step la
  -> engine sync status sang release_dsp_delivery neu step can sync
```

## 2. Nghiep vu xu ly 1 release

Mot release khi submit se di qua cac nhom nghiep vu chinh:

1. Chuan bi release:
    - Gen UPC neu release chua co UPC.
    - Gen ISRC cho cac track chua co ISRC.
    - Validate schema/metadata release.

2. Phan loai DSP:
    - DSP nao di direct.
    - DSP nao di qua aggregator.
    - Neu aggregator la CI thi tiep tuc phan loai DSP co deal CI va DSP di State51.

3. Delivery:
    - Direct DSP: tao metadata, upload SFTP/S3, wait partner, sync ket qua partner.
    - CI aggregator: import metadata vao CI, validate QA flag, sau do export sang CI admin export hoac State51 email.

4. Dong bo status:
    - Status tung DSP duoc luu trong `release_dsp_delivery`.
    - Release status co the derive tu status cua cac DSP delivery.

## 3. parseMetadata phan loai DSP nhu the nao

Sau khi execution bat dau, `ReleaseExecution3Service.startProcessing` goi `parseMetadata(execution)`.

Input cua `parseMetadata`:

```ts
execution.metadata.input.dspCodes;
execution.metadata.input.releaseSnapshot;
```

Tu danh sach `dspCodes`, BE query bang `dsps` kem `dspRoutingConfig` va `aggregator`.

Sau do chia DSP thanh cac nhom:

```text
Direct DSP
  - Spotify
  - Vevo

Aggregator DSP
  CI
    - TikTok
    - Apple Music
    - ...
```

Quy tac trong code hien tai:

- Neu DSP co `dspRoutingConfig.mode = AGGREGATOR` va `aggregator.code = 'CI'` thi la DSP di qua CI.
- Neu khong phai case tren thi la direct DSP.
- Trong CI:
    - `dsp.hasDeal = true` -> di nhanh CI admin export.
    - `dsp.hasDeal = false` -> di nhanh State51 email.

Ket qua duoc luu vao `execution.metadata` de cac step con dung lai:

```ts
metadata.input.dspDirect;
metadata.input.dspAggregator.ci.ci;
metadata.input.dspAggregator.ci.state51;
metadata.input.dspAggregator.ci.primaryDsp;
metadata.input.delivery.all;
metadata.input.delivery.directByDspId;
metadata.input.delivery.aggCi;
```

`metadata.input.delivery.*` la data dung de sync sang bang `release_dsp_delivery`.

## 4. Vai tro cua builder, engine, worker, service

### ReleaseExecution3Service

`ReleaseExecution3Service` la lop dieu phoi chinh.

Nhiem vu:

- Tao execution moi.
- Start execution.
- Goi `parseMetadata`.
- Goi builder de build cay step.
- Day job run pipeline vao queue.
- Goi engine chay pipeline.
- Retry/update status step khi co action tu admin hoac cron.

No handle 3 thanh phan chinh:

```text
ReleaseExecution3Service
  -> ReleaseExecution3Builder
  -> ReleaseExecutionStepEngine
  -> ReleaseExecution3Worker
```

### Builder

`ReleaseExecution3Builder` phu trach build cay step.

Builder chi tao record step trong DB, khong xu ly nghiep vu delivery.

Vi du:

```text
PROCESS_DSPS
  PROCESS_DIRECT
    PROCESS_DIRECT_CHILD
      CREATE_METADATA_ON_SERVER
      UPLOAD_METADATA_TO_SFTP
      WAIT_PARTNER_PROCESS
      SYNC_DATA_PARTNER
  PROCESS_AGG
    PROCESS_AGG_CI
      IMPORT_CI
      EXPORT_CI
```

Neu sau nay direct Spotify va direct Vevo co step khac nhau, co the them `type` moi trong enum step va sua builder de build nhanh con tuong ung.

### Engine

`ReleaseExecutionStepEngine` phu trach dieu huong status va quan he step cha/con.

Engine khong nen chua nghiep vu cu the nhu upload SFTP hay lay QA flag. Engine chi quyet dinh:

- Step nao duoc chay.
- Step cha chay con theo sequential hay parallel.
- Khi nao dung luong.
- Status cha duoc derive tu status con nhu the nao.
- Step nao can sync delivery status.

### Worker

`ReleaseExecution3Worker` phu trach nghiep vu that cua tung step la.

Vi du:

- `GEN_UPC` -> goi service gen UPC.
- `GEN_ISRC` -> goi service gen ISRC.
- `VALIDATE` -> validate release snapshot.
- `CREATE_METADATA_ON_SERVER` -> tao DDEX metadata.
- `UPLOAD_METADATA_TO_SFTP` -> upload SFTP/S3.
- `CREATE_FOLDER_DONE_CI` -> tao folder `.done`.
- `VALIDATE_QA_CI` -> goi CI API lay QA flags.
- `WAITING_ADMIN_EXPORT` -> tao `ci_distribution_jobs3`.
- `SEND_EMAIL_STATE51` -> tao job email State51.

## 5. Step cha, step con, sequential va parallel

Moi step co the co nhieu step con.

Field quan trong:

```ts
parentStepId;
childExecutionMode; // sequential | parallel
isDeliveryStep;
metadata;
status;
```

### Sequential

Sequential nghia la chay lan luot tung child theo `order`.

Neu 1 child fail hoac can cho action, luong se dung:

```text
CREATE_METADATA_ON_SERVER -> DONE
UPLOAD_METADATA_TO_SFTP   -> DONE
WAIT_PARTNER_PROCESS      -> WAITING_PARTNER
SYNC_DATA_PARTNER         -> chua chay
```

Neu 1 child trong luong sequential fail, parent step cung fail.

Vi du:

```text
IMPORT_CI
  CREATE_METADATA_ON_SERVER -> DONE
  UPLOAD_METADATA_TO_SFTP   -> DONE
  CREATE_FOLDER_DONE_CI     -> DONE
  WAIT_PARTNER_PROCESS      -> DONE
  VALIDATE_QA_CI            -> FAILED

=> IMPORT_CI FAILED
=> PROCESS_AGG_CI FAILED
```

### Parallel

Parallel nghia la cac nhanh con doc lap voi nhau ve nghiep vu.

Vi du `PROCESS_DSPS` co 2 nhanh:

```text
PROCESS_DSPS
  PROCESS_DIRECT
  PROCESS_AGG
```

Neu nhanh direct Spotify fail, nhanh aggregator CI van co the co ket qua rieng. Status cha se derive tu tap status con.

Luu y code hien tai van lap qua tung child trong 1 process, nhung logic status coi cac nhanh parallel la cac nhanh doc lap.

## 6. Direct DSP flow

Vi du direct Spotify:

```text
PROCESS_DIRECT_CHILD (isDeliveryStep = true)
  CREATE_METADATA_ON_SERVER
  UPLOAD_METADATA_TO_SFTP
  WAIT_PARTNER_PROCESS
  SYNC_DATA_PARTNER
```

Y nghia:

1. Tao metadata DDEX tren server.
2. Upload metadata len SFTP/S3 cua DSP.
3. Cho partner xu ly trong khoang thoi gian cau hinh.
4. Sync ket qua partner ve bang delivery.

Vevo cung co the la direct, nhung upload co logic rieng: neu `dspCode = VEVO` thi upload qua S3.

Neu can them logic rieng cho mot direct DSP, co 2 cach:

- Them step type moi vao enum `ReleaseExecutionStepType`.
- Sua builder de build nhanh step rieng cho DSP do.
- Them handler trong worker de xu ly step moi.

## 7. Aggregator CI flow

Voi cac DSP route qua aggregator CI:

```text
PROCESS_AGG_CI (isDeliveryStep = true)
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

### Import CI

Import CI la giai doan dua metadata vao CI:

1. Tao metadata.
2. Upload vao SFTP CI.
3. Tao folder `.done`.
4. Cho CI xu ly.
5. Validate QA flag.

Neu QA flag fail, nhanh import CI fail va khong di tiep export.

### Export CI

Sau khi import CI pass QA, pipeline moi tao export job.

Voi DSP co deal CI:

```text
WAITING_ADMIN_EXPORT
  -> tao job type ADMIN_EXPORT trong ci_distribution_jobs3
  -> step WAITING_ACTION
  -> cho admin/cron/CI Tool xu ly
```

Voi DSP khong co deal CI:

```text
SEND_EMAIL_STATE51
  -> tao job type EMAIL_STATE51 trong ci_distribution_jobs3
  -> step WAITING_ACTION
  -> cho cron gui email State51
```

## 8. Sync release delivery DSP

Khong phai step nao cung sync vao `release_dsp_delivery`.

Step nao can sync thi builder set:

```ts
isDeliveryStep: true;
```

Khi engine update status cua step, engine se check:

```ts
if (!step.isDeliveryStep) return;
```

Neu step can sync, engine lay data:

```ts
step.metadata.input.delivery.releaseId
step.metadata.input.delivery.items[].dspId
```

Sau do map status:

```text
Step PROCESSING -> delivery processing
Step DONE       -> delivery distributed
Step FAILED     -> delivery issues
Step CANCELLED  -> delivery issues
Step SKIPPED    -> delivery issues
```

Vi du:

```text
PROCESS_DIRECT_CHILD Spotify DONE
  -> release_dsp_delivery(Spotify).status = distributed

PROCESS_AGG_CI FAILED
  -> release_dsp_delivery(TikTok).status = issues
  -> release_dsp_delivery(Apple Music).status = issues
```

## 9. Vi du VALIDATE_QA_CI fail

Step `VALIDATE_QA_CI` nam trong nhanh CI import.

Worker xu ly:

```text
VALIDATE_QA_CI
  -> releaseService.getQaFlagCi(releaseId)
  -> CI API tim release theo UPC
  -> CI API lay metadata QA flags
  -> luu qaFlags vao step.metadata.output
```

Neu CI tra ve co QA flag:

```ts
step.metadata.output = {
	qaFlags,
	hasIssues: true,
};
```

Step return `FAILED`.

Sau do engine xu ly:

```text
VALIDATE_QA_CI FAILED
  -> IMPORT_CI FAILED
  -> PROCESS_AGG_CI FAILED
  -> vi PROCESS_AGG_CI isDeliveryStep = true
  -> sync release_dsp_delivery cua cac DSP CI thanh issues
```

Neu muon sync them chi tiet issue, co the dung `step.metadata.output.qaFlags` de update cot `issues` cua `release_dsp_delivery`. Code hien tai moi map status delivery, chua thay gan qaFlags vao cot `issues`.

## 10. Status release tong

Bang `release_dsp_delivery` la source de tinh release status tong.

Mapping tong quat:

```text
Tat ca DSP distributed -> release distributed
Tat ca DSP issues      -> release failed
Con DSP processing     -> release processing
Mix distributed/issues -> release partial_done
```

Hien tai v3 sync status DSP delivery trong engine. Viec sync `release.status` tong dang dung ham:

```ts
releaseSubmitService2.deriveAndUpdateReleaseStatus(releaseId);
```

Endpoint manual:

```http
POST /releases/:id/sync-release-status
```

Diem can luu y: trong code v3 hien tai chua thay hook auto goi ham derive release status sau moi lan pipeline ket thuc. Neu UI can release status cap nhat tu dong, nen bo sung sync nay vao execution v3.

## 11. Tom tat theo folder code

```text
release.service.ts
  submit3: nhan submit tu controller, set release submitted, tao execution v3

release-execution3.service.ts
  tao execution, parseMetadata, build tree, run pipeline, retry/update step

release-execution3.builder.ts
  build cay step cha/con dua tren release snapshot va metadata DSP da parse

release-execution3.engine.ts
  dieu huong sequential/parallel, derive status cha/con, sync delivery DSP

release-execution3.worker.ts
  xu ly nghiep vu that cua tung step la

ci-distribution-job3.service.ts
  xu ly job admin export CI, email State51, confirm completed, cron send/check

release-dsp-delivery.service.ts
  upsert/update status release_dsp_delivery
```

## 12. Diem mo rong trong tuong lai

Neu them mot DSP direct moi co flow rieng:

1. Them enum step type moi trong `ReleaseExecutionStepType`.
2. Sua builder de build step do cho DSP tuong ung.
3. Them case dispatch trong worker.
4. Neu step can update delivery, set `isDeliveryStep = true` va truyen `metadata.input.delivery`.

Neu them aggregator moi ngoai CI:

1. Sua `parseMetadata` de phan loai aggregator moi.
2. Luu data can thiet vao `execution.metadata`.
3. Sua builder de build nhanh aggregator moi.
4. Them worker handler cho tung step nghiep vu cua aggregator do.
5. Xac dinh step nao sync delivery DSP.
