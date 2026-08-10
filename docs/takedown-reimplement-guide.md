# Takedown Flow — Hướng dẫn tự code lại (step-by-step)

> Mục tiêu tài liệu: bạn tự implement lại luồng takedown trên nhánh khác, **từng bước một**, hiểu rõ mỗi thay đổi đi từ đâu đến đâu và ảnh hưởng luồng nào — thay vì merge nguyên khối 2 commit `feat: take down release` (`77a06b25` + `70862c7c`).

## 0. Phạm vi thực tế của 2 commit

2 commit chỉ đụng vào **8 file source** (+ 1 file docs). So với `docs/takedown-changes-summary.md`, phần lớn khớp, nhưng có vài chỗ tài liệu cũ mô tả chưa chính xác (xem ghi chú ⚠️ ở từng bước).

| # | File | Loại thay đổi | Rủi ro ảnh hưởng luồng khác |
|---|------|---------------|------------------------------|
| 1 | `release/services/release.service.ts` | Viết lại body `takedown()` | Thấp — chỉ trong `takedown()` |
| 2 | `.../release-executions3/services/release-execution3.builder.ts` | Thêm nhánh `if TAKEDOWN` | Thấp — guard theo `type` |
| 3 | `.../release-executions3/services/release-execution3.service.ts` | Sửa 1 dòng `isSkipImport` | **Trung bình** — dùng chung cho mọi execution |
| 4 | `release/services/release-ddex.service.ts` | Thêm method + thêm param `updateIndicator` | **Trung bình** — `createErnFile` dùng chung |
| 5 | `ern2/builders/ern382.builder.ts` | Bọc `if (updateIndicator !== 'UpdateMessage')` | **Cao nếu sai** — builder XML dùng chung |
| 6 | `ern2/builders/ern43.builder.ts` | 3 chỗ theo `updateIndicator` | **Cao nếu sai** — builder XML dùng chung |
| 7 | `.../release-executions3/services/release-execution3.engine.ts` | Luồng `executionType` → status | **Trung bình** — engine dùng chung |
| 8 | `schedule/schedule.service.ts` | Comment out guard `APP_ROLE` | ⚠️ **KHÔNG liên quan takedown** — xem bước 8 |

### Điều kiện tiên quyết (ĐÃ CÓ SẴN trước 2 commit — KHÔNG cần tạo mới)

Đã xác nhận bằng `git show 77a06b25^:...`:

- `ExecutionType.TAKEDOWN = 'TAKEDOWN'` — trong `release-execution3.enum.ts`
- `ReleaseExecutionStepType.PROCESS_DSPS = 'PROCESS_DSPS'` — cùng file enum
- `ReleaseDspStatus.TAKEN_DOWN = 'taken_down'` — trong `release-dsp.enum.ts`
- `SubmitReleaseDto` đã có `code: string[]` và `needImportAgain?: boolean`
- Controller đã có route `@Post(':id/takedown')` gọi `releaseService.takedown(id, userId, dto)`
- Helper `applyCiImportActionToReleaseSnapshot(release, needImportAgain)` đã tồn tại (dùng chung với `submit3`)

Nếu nhánh đích của bạn cũng đã có sẵn các thứ trên thì bỏ qua; nếu chưa, phải tạo trước khi làm 8 bước dưới.

## Thứ tự implement (bottom-up)

Nguyên tắc: code từ **lá → gốc**. Bắt đầu ở tầng sinh XML (test được độc lập), rồi tới service tạo file, rồi orchestration, cuối cùng mới tới entry point `takedown()`. Mỗi bước sửa **đúng 1 vùng**, verify xong mới sang bước sau.

| Bước | File | Vùng sửa | Verify nhanh |
|------|------|----------|--------------|
| 1 | `ern2/builders/ern382.builder.ts` | Bọc `TechnicalSoundRecordingDetails` + `TechnicalImageDetails` | Generate XML 3.8.2 với `updateIndicator: 'UpdateMessage'` |
| 2 | `ern2/builders/ern43.builder.ts` | Audio + Video `IsProvidedInDelivery` | Generate XML 4.3 audio/video |
| 3 | `ern2/builders/ern43.builder.ts` | Cover art `TechnicalDetails` | Generate XML 4.3 image |
| 4 | `release/services/release-ddex.service.ts` | `createErnFile` + `createTakedownMetadataOnServer` | `tsc` + gọi thử method |
| 5 | `.../release-execution3.builder.ts` | Nhánh `if TAKEDOWN` | Tạo execution TAKEDOWN, check chỉ có `PROCESS_DSPS` |
| 6 | `.../release-execution3.service.ts` | `isSkipImport` | `tsc` + đọc lại logic |
| 7 | `.../release-execution3.worker.ts` | Dispatch `createTakedownMetadataOnServer` | `tsc` |
| 8 | `.../release-execution3.engine.ts` | Thread `executionType` → `TAKEN_DOWN` | `tsc` + đọc chuỗi truyền tham số |
| 9 | `release/services/release.service.ts` | Viết lại body `takedown()` | Gọi API `POST :id/takedown` end-to-end |
| — | `schedule/schedule.service.ts` | ⛔ **BỎ QUA** | Không merge (xem cuối tài liệu) |

---

## Bước 1: `ern2/builders/ern382.builder.ts` — bỏ Technical*Details

**Vị trí:** 2 method build `SoundRecordingDetailsByTerritory` và `ImageDetailsByTerritory` (khoảng dòng 227 và 329 ở bản gốc).

**Việc cần làm:** Bọc toàn bộ block tạo `TechnicalSoundRecordingDetails` (audio) và `TechnicalImageDetails` (cover) trong:

```typescript
if (this.input.updateIndicator !== 'UpdateMessage') {
    // ... giữ nguyên logic cũ, không đổi nội dung bên trong
}
```

**Lưu ý khi tự code:**
- Không xóa logic bên trong, chỉ thêm `if` bao ngoài — tránh gõ lại toàn bộ đoạn code (dễ lỗi thụt lề/thiếu field).
- `this.input.updateIndicator` đã có sẵn trên interface (`ern-input.interface.ts`), không cần thêm field mới.
- `<ResourceList>` / `SoundRecordingDetailsByTerritory` / `ImageDetailsByTerritory` **vẫn phải render** — chỉ bỏ phần `Technical*Details` bên trong. Nếu lỡ bọc `if` ra ngoài luôn parent tag → lỗi schema `ResourceList` rỗng (xem bảng lỗi CI ở cuối file gốc summary).

**Verify:** viết 1 test/script gọi `Ern382Builder2` với input mẫu có `updateIndicator: 'UpdateMessage'`, in XML ra, check bằng mắt là `SoundRecordingDetailsByTerritory` và `ImageDetailsByTerritory` không còn con `Technical*Details`, nhưng `ISRC`, `Title`, `Duration` vẫn còn.

---

## Bước 2: `ern2/builders/ern43.builder.ts` — audio/video `IsProvidedInDelivery`

**Vị trí:** 2 chỗ độc lập — 1 trong method build audio track, 1 trong method build video (khoảng dòng 284 và 407 bản gốc).

**Việc cần làm:** Đổi giá trị cố định `'true'` thành có điều kiện:

```typescript
deliveryFile
    .ele('IsProvidedInDelivery')
    .txt(this.input.updateIndicator === 'UpdateMessage' ? 'false' : 'true');
```

**Lưu ý:** Đây là 2 method riêng (audio + video) — sửa cả 2, đừng chỉ sửa 1 rồi quên cái còn lại. Toàn bộ `TechnicalDetails` khác của audio/video (bitrate, filename...) **giữ nguyên, không bọc if** — chỉ đổi giá trị flag này.

**Verify:** generate XML 4.3 cho 1 release có audio + video, check `IsProvidedInDelivery` = `false` khi `updateIndicator: 'UpdateMessage'`, và `TechnicalDetails` (bitrate, URI...) vẫn còn đầy đủ.

---

## Bước 3: `ern2/builders/ern43.builder.ts` — cover art `TechnicalDetails`

⚠️ **Bước này KHÔNG có trong `takedown-changes-summary.md`** — summary chỉ nói ERN 4.3 "giữ TechnicalDetails, dùng IsProvidedInDelivery", nhưng commit 2 (`70862c7c`) sửa riêng phần ảnh cover: bọc luôn `TechnicalDetails` của image trong `if`, giống cách làm ở ERN 3.8.2 — không dùng `IsProvidedInDelivery` cho ảnh.

**Vị trí:** Method build cover art details (khoảng dòng 565 bản trước commit 2).

**Việc cần làm:**

```typescript
if (this.input.updateIndicator !== 'UpdateMessage') {
    const tech = image.ele('TechnicalDetails');
    tech.ele('TechnicalResourceDetailsReference').txt(techRef);
    const file = tech.ele('File');
    // ... URI, HashSum giữ nguyên như cũ
}
```

**Lý do (suy ra từ diff, summary không ghi):** Cover art trong ERN 4.3 có lẽ không hỗ trợ `IsProvidedInDelivery` như audio/video, hoặc CI vẫn tìm file cover qua `<File><URI>` bất kể flag — nên phải bỏ hẳn tag như 3.8.2.

**Verify:** generate XML 4.3 có cover, check `Image > TechnicalDetails` không xuất hiện khi takedown, nhưng vẫn xuất hiện bình thường khi release thường (`updateIndicator` undefined hoặc `'OriginalMessage'`).

---

## Bước 4: `release/services/release-ddex.service.ts`

**4a. `createErnFile` — thêm param `updateIndicator`:**

```typescript
createErnFile({
    release, outputDir, ernVersion, sender, recipient, coverExtension,
    updateIndicator, // thêm
}: {
    // ... các field cũ
    updateIndicator?: 'OriginalMessage' | 'UpdateMessage'; // thêm
}) {
    const input = this.parseErnInputFromRelease({ release, outputDir, ernVersion, sender, recipient, coverExtension });
    if (updateIndicator) {
        input.updateIndicator = updateIndicator;
    }
    const xmlContent = this.ernService2.generate(input);
    // ... phần còn lại giữ nguyên
}
```

Param optional → không ảnh hưởng các call site cũ (release thường không truyền, mặc định `undefined` → builder tự fallback `'OriginalMessage'` như bước 1).

**4b. Thêm method mới `createTakedownMetadataOnServer`:**

Copy cấu trúc từ `createMetadataOnServer` hiện có nhưng bỏ toàn bộ phần liên quan tới `resources/` (audio/video/cover file):

```typescript
async createTakedownMetadataOnServer({
    release, ernVersion, recipient, sender, dspCode,
}: {
    release: Release;
    ernVersion: ErnVersion2;
    sender: { partyId: string; name: string };
    recipient: { partyId: string; name: string };
    dspCode?: string;
}) {
    const batchId = genBatchId();
    const upc = release.upc ?? 'new_upc';
    const releaseReference = release.type === 'video' ? release.video?.isrc : upc;

    if (!releaseReference) {
        throw new Error(
            release.type === 'video'
                ? 'Không tìm thấy mã ISRC của video'
                : 'Không tìm thấy mã UPC của release',
        );
    }

    const baseDir = process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
    const outputRoot = path.join(baseDir, batchId);
    const releaseDir = path.join(outputRoot, releaseReference);

    fs.mkdirSync(releaseDir, { recursive: true }); // KHÔNG tạo resources/ con

    const xml = this.createErnFile({
        release, outputDir: releaseDir, ernVersion, recipient, sender,
        coverExtension: undefined,
        updateIndicator: 'UpdateMessage', // luôn set — takedown luôn là update
    });

    if (dspCode?.toUpperCase() !== 'VEVO') {
        this.createManifestFile({ batchId, upc, outputRoot, sender, recipient });
    }

    this.logger.log({
        releaseId: release.id,
        step: 'createTakedownMetadataOnServer',
        message: `[ABS_PATH] ${path.resolve(releaseDir)}`,
    });

    return { outputDir: outputRoot, batchId, releaseReference, xml };
}
```

**Lưu ý:**
- Method trả về đúng shape `{ outputDir, batchId, releaseReference, xml }` giống `createMetadataOnServer` — bước 7 (worker) dựa vào shape này để dispatch, không cần sửa code gọi phía sau.
- `dspCode?.toUpperCase() !== 'VEVO'` — giữ đúng theo code gốc, đừng tự đổi điều kiện này nếu không hiểu rõ lý do (không có giải thích trong summary, cần hỏi lại nếu nghi ngờ).
- Đừng đụng tới đoạn captions ở dòng ~1442 (`release.captions?.map(...)`) — trong diff commit 1 đoạn này chỉ đổi indent, không đổi logic. Nếu prettier/eslint tự động thụt lề khác thì bỏ qua, không phải phần cần cài đặt.

**Verify:** `npx tsc --noEmit`, sau đó gọi thử `createTakedownMetadataOnServer` với 1 release mẫu, check thư mục output không có `resources/`.

---

## Bước 5: `.../release-execution3.builder.ts`

**Vị trí:** đầu switch-case (`case undefined:`) trong method build steps.

```typescript
import { ReleaseExecutionStepType, ExecutionType } from '../enums/release-execution3.enum';

// ...
case undefined: {
    let order = 1;

    if (releaseExecution.type === ExecutionType.TAKEDOWN) {
        stepResult.push({
            type: ReleaseExecutionStepType.PROCESS_DSPS,
            order: order++,
            childExecutionMode: 'parallel',
            isDeliveryStep: true,
            metadata: {
                input: {
                    delivery: releaseExecution.metadata.input.delivery?.all,
                },
            },
        });
        break; // QUAN TRỌNG — return sớm, không rơi xuống logic GEN_UPC/GEN_ISRCS/VALIDATE bên dưới
    }

    // ... logic release bình thường giữ nguyên, không sửa
}
```

**Lưu ý:** `break` bắt buộc phải có ngay sau khi push — nếu quên, code sẽ rơi tiếp vào logic tạo `GEN_UPC`/`GEN_ISRCS`/`VALIDATE` cho cả execution TAKEDOWN, sai với mục tiêu "chỉ có PROCESS_DSPS".

**Verify:** tạo execution với `type: TAKEDOWN`, check `stepResult` chỉ có 1 step `PROCESS_DSPS`.

---

## Bước 6: `.../release-execution3.service.ts` — `isSkipImport`

**Vị trí:** đoạn build `metadata.input.dspAggregator.ci` trong method tạo execution (khoảng dòng 193 bản gốc).

```typescript
execution.metadata.input.dspAggregator = {
    ci: {
        ci: ciDealDsps,
        state51: state51Dsps,
        primaryDsp: null,
        isSkipImport:
            execution.type === ExecutionType.TAKEDOWN
                ? false
                : releaseSnapshot.ciData?.needImportAgain === false,
    },
};
```

**Rủi ro khi tự code:** đây là code dùng chung cho MỌI execution (không chỉ takedown) — sửa sai điều kiện (ví dụ đảo ngược `? :`) sẽ ảnh hưởng luồng release thường (làm nó luôn skip hoặc luôn không skip import). Đọc kỹ: chỉ khi `type === TAKEDOWN` thì ép `false`, còn lại giữ nguyên biểu thức gốc.

**Verify:** `tsc --noEmit`, đọc lại 1 lượt đảm bảo nhánh release thường (`type !== TAKEDOWN`) cho cùng kết quả với code trước khi sửa.

---

## Bước 7: `.../release-execution3.worker.ts` — dispatch tạo metadata

**Vị trí:** chỗ gọi `createMetadataOnServer` trong worker xử lý step `CREATE_METADATA_ON_SERVER`.

```typescript
import { CiJobType3, ExecutionType, ReleaseExecutionStepStatus, ReleaseExecutionStepType } from '../enums/release-execution3.enum';

// ...
const isTakedown = releaseExecution.type === ExecutionType.TAKEDOWN;

const { outputDir, batchId, releaseReference, xml } = isTakedown
    ? await this.releaseDdexService.createTakedownMetadataOnServer({
          release: releaseForMetadata,
          ernVersion: config.ernVersion,
          sender: config.sender,
          recipient: config.recipient,
          dspCode,
      })
    : await this.releaseDdexService.createMetadataOnServer({
          release: releaseForMetadata,
          ernVersion: config.ernVersion,
          sender: config.sender,
          recipient: config.recipient,
          dspCode,
      });
```

**Lưu ý:** phần code phía sau (dùng `outputDir`, `batchId`, `releaseReference`, `xml` để lưu step metadata, upload SFTP...) **không đổi** — nhờ 2 method trả về cùng shape.

**Verify:** `tsc --noEmit`.

---

## Bước 8: `.../release-execution3.engine.ts` — thread `executionType`

Đây là bước "luồn" 1 tham số (`executionType`) qua 4 method gọi lồng nhau, tới tận nơi quyết định status. Làm theo thứ tự từ trong ra ngoài để không bị lỗi kiểu thiếu tham số:

**8a.** `mapStepStatusToDeliveryStatus(step, stepStatus, executionType?)` — thêm tham số thứ 3, dùng ở nhánh DONE:

```typescript
if (stepStatus === ReleaseExecutionStepStatus.DONE) {
    return executionType === ExecutionType.TAKEDOWN
        ? ReleaseDspStatus.TAKEN_DOWN
        : ReleaseDspStatus.DISTRIBUTED;
}
```

**8b.** `syncDeliveryStatusByStepStatus(step, stepStatus, executionType?)` — thêm tham số, truyền tiếp vào `mapStepStatusToDeliveryStatus`.

**8c.** `updateStepStatus(step, status, executionType?)` — thêm tham số, truyền tiếp vào `syncDeliveryStatusByStepStatus`.

**8d.** `resolveStatusByChild_AndUpdateDb(step, executionType?)` — thêm tham số, truyền tiếp vào `updateStepStatus`.

**8e.** Tất cả nơi gọi 2 method ở 8c/8d (3-4 chỗ trong method xử lý step chính) — thêm `releaseExecution.type` vào cuối lời gọi. Ví dụ:

```typescript
await this.updateStepStatus(STEP, status, releaseExecution.type);
// ...
return this.resolveStatusByChild_AndUpdateDb(STEP, releaseExecution.type);
```

**Lưu ý:** tất cả tham số đều **optional** (`executionType?: ExecutionType`) — nếu quên truyền ở 1 call site, code vẫn compile nhưng execution đó sẽ không map được `TAKEN_DOWN` (fallback về hành vi cũ). Sau khi sửa, dùng "Find All References" trên `updateStepStatus` và `resolveStatusByChild_AndUpdateDb` để chắc chắn không bỏ sót call site nào.

**Verify:** `tsc --noEmit` + đọc lại toàn bộ method chính (nơi gọi 8c/8d) 1 lượt.

---

## Bước 9: `release/services/release.service.ts` — viết lại `takedown()`

Đây là entry point — sửa **cuối cùng** vì nó gọi tất cả các phần đã build ở bước 1-8.

**Code cũ (trước khi sửa):**

```typescript
async takedown(id: string, userId: string, dto: SubmitReleaseDto) {
    await this.releaseQueryService.findOne(id);
    await this.releaseRepo.update(id, {
        releaseEndDate: new Date(),
    });

    await this.submit3(id, dto);
}
```

**Code mới:**

```typescript
async takedown(id: string, userId: string, dto: SubmitReleaseDto) {
    await this.releaseQueryService.findOne(id);

    try {
        await this.releaseCiDataService.bulkSyncDataCi({ ids: [id] });
    } catch (error) {
        console.log(error);
    }

    const releaseEndDate = new Date();
    releaseEndDate.setDate(releaseEndDate.getDate() - 1);
    await this.releaseRepo.update(id, {
        status: ReleaseStatus.SUBMITTED,
        releaseEndDate,
    });

    const release = await this.releaseQueryService.findOneReleaseFull({
        releaseId: id,
    });

    this.applyCiImportActionToReleaseSnapshot(release, dto.needImportAgain);

    return this.releaseExecution3Service.newReleaseExecution({
        release,
        dspCodes: dto.code,
        type: ExecutionType.TAKEDOWN,
    });
}
```

**So với `takedown-changes-summary.md`:** summary bỏ qua 2 chi tiết — (1) `bulkSyncDataCi` được bọc `try/catch`, lỗi chỉ log ra console, không throw (không chặn takedown nếu sync CI lỗi); (2) có gọi `applyCiImportActionToReleaseSnapshot(release, dto.needImportAgain)` — helper này **đã tồn tại sẵn**, dùng chung với `submit3`, không cần viết mới.

**Vì sao không dùng lại `submit3()`:** `submit3()` sẽ nullify `releaseEndDate` khi submit release thường. Takedown cần set `releaseEndDate = hôm qua` TRƯỚC KHI load snapshot (để snapshot đọc được endDate mới) — nên phải viết logic riêng, gọi trực tiếp `releaseExecution3Service.newReleaseExecution(...)` thay vì qua `submit3()`.

**Lưu ý:**
- `status: ReleaseStatus.SUBMITTED` — set cứng, không phải giữ status hiện tại.
- Thứ tự bắt buộc: update DB (endDate mới) → load lại snapshot → mới gọi `newReleaseExecution`. Đảo thứ tự sẽ làm snapshot mang endDate cũ.
- `releaseCiDataService` và `releaseExecution3Service` phải đã được inject vào constructor của `ReleaseService` — kiểm tra trước, nhiều khả năng đã có sẵn (dùng chung `submit3`).

**Verify:** gọi API `POST /release/:id/takedown` end-to-end trên môi trường test, theo dõi:
1. `release.releaseEndDate` = hôm qua, `status` = `SUBMITTED`.
2. Execution mới có `type = TAKEDOWN`, chỉ có step `PROCESS_DSPS`.
3. XML sinh ra không có `resources/` folder, có `UpdateIndicator = UpdateMessage`.
4. Theo dõi tới khi step DONE → `ReleaseDsp.status = TAKEN_DOWN` (không phải `DISTRIBUTED`).

---

## ⛔ KHÔNG merge: `schedule/schedule.service.ts`

Commit 1 comment-out đoạn guard trong `onApplicationBootstrap()`:

```typescript
// if (process.env.APP_ROLE !== 'worker') {
//     const jobs = this.schedulerRegistry.getCronJobs();
//     for (const name of jobs.keys()) {
//         this.schedulerRegistry.deleteCronJob(name);
//     }
//     return;
// }
```

**`takedown-changes-summary.md` không đề cập file này** — rất có thể đây là thay đổi tạm để debug/test cron trên môi trường của tác giả commit, không thuộc scope takedown. Việc comment-out guard này khiến **mọi instance** (không chỉ `worker`) đều chạy cron job, có thể gây side-effect không mong muốn (chạy job trùng lặp trên nhiều instance). Nên bỏ qua bước này, giữ nguyên guard gốc.

Nếu thực sự cần thay đổi hành vi này, nên tách thành 1 commit/PR riêng có mô tả rõ lý do, verify độc lập với takedown.

---

## Sau khi xong cả 9 bước

- Chạy `npx tsc --noEmit` toàn repo.
- Chạy lại toàn bộ luồng release thường (submit, deliver) để đảm bảo không regression — vì bước 5, 6, 8 đều sửa code path dùng chung.
- Đối chiếu bảng lỗi CI đã gặp (trong `takedown-changes-summary.md`, mục "Lỗi CI đã gặp và giải quyết") để test lại đúng các case đã từng lỗi.
- Vấn đề còn tồn đọng (ghi lại để xử lý sau, không thuộc scope 9 bước trên): `SYNC_DATA_DSP_CI` có thể ghi đè status từ CI API thành `DISTRIBUTED` thay vì giữ `TAKEN_DOWN` — cần thêm check `executionType` tương tự bước 8 nếu gặp vấn đề này khi test thực tế.
