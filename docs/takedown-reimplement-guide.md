# 🔧 Takedown Flow — Hướng dẫn tự code lại (step-by-step)

> **Mục tiêu:** Tự implement lại luồng takedown **từng bước một**, hiểu rõ mỗi thay đổi — thay vì merge nguyên khối 2 commit `feat: take down release` (`77a06b25` + `70862c7c`).

---

## 📋 Tổng quan thay đổi

2 commit đụng **8 file source** + 1 file docs. Có vài điểm khác biệt so với `takedown-changes-summary.md` (đánh dấu ⚠️).

| File | Thay đổi | Rủi ro |
|------|----------|--------|
| `release.service.ts` | Viết lại body `takedown()` | 🟢 Thấp |
| `release-execution3.builder.ts` | Thêm nhánh `if TAKEDOWN` | 🟢 Thấp |
| `release-execution3.service.ts` | Sửa `isSkipImport` | 🟡 Trung bình |
| `release-ddex.service.ts` | Thêm method + param | 🟡 Trung bình |
| `ern382.builder.ts` | Bọc Technical*Details | 🔴 Cao |
| `ern43.builder.ts` | 3 chỗ theo updateIndicator | 🔴 Cao |
| `release-execution3.engine.ts` | Thread executionType | 🟡 Trung bình |
| `schedule.service.ts` | ⛔ **BỎ QUA** | N/A |

### ✅ Điều kiện tiên quyết (đã có sẵn)

Các enum/helper sau **đã tồn tại** trước 2 commit — không cần tạo mới:
- `ExecutionType.TAKEDOWN`
- `ReleaseExecutionStepType.PROCESS_DSPS`
- `ReleaseDspStatus.TAKEN_DOWN`
- `SubmitReleaseDto` có `code[]` và `needImportAgain?`
- Route `@Post(':id/takedown')` đã có
- Helper `applyCiImportActionToReleaseSnapshot` đã có

---

## 🗂️ Thứ tự implement (bottom-up)

Code từ **lá → gốc**: XML builders → service → orchestration → entry point.

| # | File | Vùng sửa | Verify |
|---|------|----------|--------|
| 1️⃣ | `ern382.builder.ts` | Bọc TechnicalDetails | Gen XML 3.8.2 |
| 2️⃣ | `ern43.builder.ts` | IsProvidedInDelivery (audio/video) | Gen XML 4.3 |
| 3️⃣ | `ern43.builder.ts` | TechnicalDetails (cover) | Gen XML 4.3 image |
| 4️⃣ | `release-ddex.service.ts` | Method mới + param | `tsc` + test |
| 5️⃣ | `release-execution3.builder.ts` | If TAKEDOWN branch | Check steps |
| 6️⃣ | `release-execution3.service.ts` | isSkipImport logic | `tsc` |
| 7️⃣ | `release-execution3.worker.ts` | Dispatch method | `tsc` |
| 8️⃣ | `release-execution3.engine.ts` | Thread executionType | `tsc` |
| 9️⃣ | `release.service.ts` | Viết lại takedown() | API test |

---

## 1️⃣ ERN 3.8.2: Bọc Technical*Details

**File:** `src/modules/ern2/builders/ern382.builder.ts`  
**Dòng:** ~227 (audio), ~329 (cover)

### Việc cần làm

Bọc 2 block `TechnicalSoundRecordingDetails` và `TechnicalImageDetails`:

```typescript
// Audio
if (this.input.updateIndicator !== 'UpdateMessage') {
    const tech = details.ele('TechnicalSoundRecordingDetails');
    // ... giữ nguyên toàn bộ logic cũ
}

// Cover (tương tự)
if (this.input.updateIndicator !== 'UpdateMessage') {
    const tech = details.ele('TechnicalImageDetails');
    // ... giữ nguyên toàn bộ logic cũ
}
```

> **⚠️ Lưu ý:**
> - Chỉ thêm `if` bao ngoài, KHÔNG đổi code bên trong
> - `<ResourceList>` và metadata (ISRC, Title...) **vẫn phải render**
> - `updateIndicator` đã có sẵn trên interface, không cần tạo field mới

**Verify:** Generate XML 3.8.2 với `updateIndicator: 'UpdateMessage'` → không có `Technical*Details` nhưng vẫn có `ISRC`, `Title`, `Duration`.

---

## 2️⃣ ERN 4.3: Audio/Video IsProvidedInDelivery

**File:** `src/modules/ern2/builders/ern43.builder.ts`  
**Dòng:** ~284 (audio), ~407 (video)

### Việc cần làm

Đổi cả 2 chỗ từ hard-coded `'true'` thành conditional:

```typescript
deliveryFile
    .ele('IsProvidedInDelivery')
    .txt(this.input.updateIndicator === 'UpdateMessage' ? 'false' : 'true');
```

> **⚠️ Lưu ý:** Sửa CẢ audio VÀ video, đừng quên 1 trong 2. TechnicalDetails khác (bitrate, URI...) giữ nguyên.

**Verify:** XML 4.3 có `IsProvidedInDelivery=false` khi takedown, `TechnicalDetails` vẫn đầy đủ.

---

## 3️⃣ ERN 4.3: Cover Art TechnicalDetails

**File:** `src/modules/ern2/builders/ern43.builder.ts`  
**Dòng:** ~565

> **⚠️ Bước này KHÔNG có trong summary** — commit 2 sửa thêm phần cover, bọc `TechnicalDetails` giống 3.8.2 (không dùng `IsProvidedInDelivery` cho ảnh).

### Việc cần làm

```typescript
if (this.input.updateIndicator !== 'UpdateMessage') {
    const tech = image.ele('TechnicalDetails');
    tech.ele('TechnicalResourceDetailsReference').txt(techRef);
    const file = tech.ele('File');
    // ... URI, HashSum giữ nguyên
}
```

**Verify:** XML 4.3 takedown không có `Image > TechnicalDetails`.

---

## 4️⃣ DDEX Service: Method + Param mới

**File:** `src/modules/release/services/release-ddex.service.ts`

### 4a. Thêm param cho createErnFile

```typescript
createErnFile({
    release, outputDir, ernVersion, sender, recipient, coverExtension,
    updateIndicator, // ← thêm (optional)
}: {
    // ...
    updateIndicator?: 'OriginalMessage' | 'UpdateMessage';
}) {
    const input = this.parseErnInputFromRelease({...});
    if (updateIndicator) {
        input.updateIndicator = updateIndicator;
    }
    // ...
}
```

### 4b. Thêm method createTakedownMetadataOnServer

Copy từ `createMetadataOnServer` nhưng:
- **KHÔNG** tạo `resources/` folder
- **KHÔNG** download/copy audio/video/cover files
- Luôn set `updateIndicator: 'UpdateMessage'`
- `coverExtension: undefined`

```typescript
async createTakedownMetadataOnServer({release, ernVersion, recipient, sender, dspCode}) {
    const batchId = genBatchId();
    const upc = release.upc ?? 'new_upc';
    const releaseReference = release.type === 'video' ? release.video?.isrc : upc;

    if (!releaseReference) {
        throw new Error(release.type === 'video' ? 'Không tìm thấy ISRC' : 'Không tìm thấy UPC');
    }

    const baseDir = process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
    const releaseDir = path.join(baseDir, batchId, releaseReference);

    fs.mkdirSync(releaseDir, { recursive: true }); // Chỉ tạo folder chính

    const xml = this.createErnFile({
        release, outputDir: releaseDir, ernVersion, recipient, sender,
        coverExtension: undefined,
        updateIndicator: 'UpdateMessage',
    });

    if (dspCode?.toUpperCase() !== 'VEVO') {
        this.createManifestFile({batchId, upc, outputRoot: path.dirname(releaseDir), sender, recipient});
    }

    this.logger.log({releaseId: release.id, step: 'createTakedownMetadataOnServer'});

    return {outputDir: path.dirname(releaseDir), batchId, releaseReference, xml};
}
```

> **⚠️ Lưu ý:**
> - Trả về đúng shape `{outputDir, batchId, releaseReference, xml}` như method gốc
> - Đoạn captions (~dòng 1442) chỉ đổi indent trong diff — bỏ qua nếu formatter tự động sửa

**Verify:** `tsc --noEmit` + gọi thử method → output không có folder `resources/`.

---

## 5️⃣ Builder: Nhánh if TAKEDOWN

**File:** `src/modules/release/modules/release-executions3/services/release-execution3.builder.ts`  
**Vị trí:** Đầu `case undefined:` trong build steps

```typescript
import { ExecutionType } from '../enums/release-execution3.enum';

case undefined: {
    let order = 1;

    if (releaseExecution.type === ExecutionType.TAKEDOWN) {
        stepResult.push({
            type: ReleaseExecutionStepType.PROCESS_DSPS,
            order: order++,
            childExecutionMode: 'parallel',
            isDeliveryStep: true,
            metadata: {input: {delivery: releaseExecution.metadata.input.delivery?.all}},
        });
        break; // ← QUAN TRỌNG: không rơi xuống logic GEN_UPC/VALIDATE
    }

    // ... logic release thường giữ nguyên
}
```

> **⚠️ Lưu ý:** Phải có `break` ngay sau push, nếu không sẽ tạo thêm step GEN_UPC/GEN_ISRCS cho takedown.

**Verify:** Tạo execution với `type: TAKEDOWN` → chỉ có 1 step `PROCESS_DSPS`.

---

## 6️⃣ Service: isSkipImport

**File:** `src/modules/release/modules/release-executions3/services/release-execution3.service.ts`  
**Dòng:** ~193

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

> **⚠️ Rủi ro cao:** Code này dùng chung cho MỌI execution. Đảo ngược `? :` sẽ phá luồng release thường. Chỉ TAKEDOWN mới ép `false`, còn lại giữ nguyên logic gốc.

**Verify:** `tsc --noEmit` + đọc lại đảm bảo nhánh `type !== TAKEDOWN` cho cùng kết quả.

---

## 7️⃣ Worker: Dispatch method

**File:** `src/modules/release/modules/release-executions3/services/release-execution3.worker.ts`

```typescript
import { ExecutionType } from '../enums/release-execution3.enum';

const isTakedown = releaseExecution.type === ExecutionType.TAKEDOWN;

const {outputDir, batchId, releaseReference, xml} = isTakedown
    ? await this.releaseDdexService.createTakedownMetadataOnServer({
          release: releaseForMetadata, ernVersion: config.ernVersion,
          sender: config.sender, recipient: config.recipient, dspCode,
      })
    : await this.releaseDdexService.createMetadataOnServer({
          release: releaseForMetadata, ernVersion: config.ernVersion,
          sender: config.sender, recipient: config.recipient, dspCode,
      });

// Phần code sau (lưu metadata, upload SFTP) KHÔNG đổi
```

**Verify:** `tsc --noEmit`.

---

## 8️⃣ Engine: Thread executionType

**File:** `src/modules/release/modules/release-executions3/services/release-execution3.engine.ts`

Luồn tham số `executionType` qua 4 method (từ trong ra ngoài):

### 8a. mapStepStatusToDeliveryStatus

```typescript
private mapStepStatusToDeliveryStatus(
    step: ReleaseExecutionStep3,
    stepStatus: ReleaseExecutionStepStatus,
    executionType?: ExecutionType, // ← thêm
): ReleaseDspStatus | null {
    // ...
    if (stepStatus === ReleaseExecutionStepStatus.DONE) {
        return executionType === ExecutionType.TAKEDOWN
            ? ReleaseDspStatus.TAKEN_DOWN
            : ReleaseDspStatus.DISTRIBUTED;
    }
    // ...
}
```

### 8b-d. Các method trung gian

```typescript
private async syncDeliveryStatusByStepStatus(step, stepStatus, executionType?) {
    const deliveryStatus = this.mapStepStatusToDeliveryStatus(step, stepStatus, executionType);
    // ...
}

private async updateStepStatus(step, status, executionType?) {
    // ...
    await this.syncDeliveryStatusByStepStatus(step, status, executionType);
}

private async resolveStatusByChild_AndUpdateDb(step, executionType?) {
    const status = this.resolveStatusByChild(step);
    await this.updateStepStatus(step, status, executionType);
    return status;
}
```

### 8e. Update call sites

Tất cả chỗ gọi `updateStepStatus` và `resolveStatusByChild_AndUpdateDb` — thêm `releaseExecution.type`:

```typescript
await this.updateStepStatus(STEP, status, releaseExecution.type);
return this.resolveStatusByChild_AndUpdateDb(STEP, releaseExecution.type);
```

> **⚠️ Lưu ý:** Tham số đều optional — quên truyền vẫn compile nhưng không map được `TAKEN_DOWN`. Dùng "Find All References" để check hết call sites.

**Verify:** `tsc --noEmit` + đọc lại method chính xử lý step.

---

## 9️⃣ Entry Point: Viết lại takedown()

**File:** `src/modules/release/services/release.service.ts`

### Code cũ (trước)

```typescript
async takedown(id: string, userId: string, dto: SubmitReleaseDto) {
    await this.releaseQueryService.findOne(id);
    await this.releaseRepo.update(id, {releaseEndDate: new Date()});
    await this.submit3(id, dto);
}
```

### Code mới

```typescript
async takedown(id: string, userId: string, dto: SubmitReleaseDto) {
    await this.releaseQueryService.findOne(id);

    try {
        await this.releaseCiDataService.bulkSyncDataCi({ids: [id]});
    } catch (error) {
        console.log(error); // Không chặn takedown nếu sync CI lỗi
    }

    const releaseEndDate = new Date();
    releaseEndDate.setDate(releaseEndDate.getDate() - 1); // Hôm qua
    await this.releaseRepo.update(id, {
        status: ReleaseStatus.SUBMITTED,
        releaseEndDate,
    });

    const release = await this.releaseQueryService.findOneReleaseFull({releaseId: id});

    this.applyCiImportActionToReleaseSnapshot(release, dto.needImportAgain);

    return this.releaseExecution3Service.newReleaseExecution({
        release,
        dspCodes: dto.code,
        type: ExecutionType.TAKEDOWN,
    });
}
```

> **📝 Giải thích:**
> - `submit3()` sẽ nullify `releaseEndDate` → không dùng được
> - Phải set `releaseEndDate = yesterday` TRƯỚC KHI load snapshot
> - `bulkSyncDataCi` bọc try/catch (summary bỏ sót chi tiết này)
> - Gọi `applyCiImportActionToReleaseSnapshot` (helper có sẵn)

**Verify end-to-end:** Gọi `POST /release/:id/takedown`, check:
1. DB: `releaseEndDate` = hôm qua, `status` = SUBMITTED
2. Execution: `type = TAKEDOWN`, chỉ có step `PROCESS_DSPS`
3. XML: có `UpdateIndicator = UpdateMessage`, không có folder `resources/`
4. Cuối luồng: `ReleaseDsp.status = TAKEN_DOWN`

---

## ⛔ KHÔNG merge: schedule.service.ts

Commit 1 comment-out guard `APP_ROLE !== 'worker'` → mọi instance đều chạy cron job.

**Lý do bỏ qua:**
- Summary không đề cập → không thuộc scope takedown
- Có thể là code debug tạm của tác giả
- Gây side-effect: job chạy trùng lặp trên nhiều instance

Nếu thực sự cần thay đổi này, tách thành commit/PR riêng có mô tả rõ lý do.

---

## ✅ Checklist sau khi xong

- [ ] `npx tsc --noEmit` pass
- [ ] Test luồng release thường (submit → deliver) không regression
- [ ] Test takedown end-to-end theo verify bước 9
- [ ] Đối chiếu bảng lỗi CI trong `takedown-changes-summary.md`

### Vấn đề còn tồn đọng

`SYNC_DATA_DSP_CI` có thể ghi đè status từ CI API thành `DISTRIBUTED` thay vì giữ `TAKEN_DOWN` — cần thêm check `executionType` tương tự bước 8 nếu gặp issue này khi test thực tế.
