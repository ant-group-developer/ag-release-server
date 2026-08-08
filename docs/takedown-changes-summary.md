# Takedown Flow - Tổng hợp thay đổi

## Mục tiêu

Implement luồng takedown release: gửi metadata XML thông báo DSP ngừng phân phối release, không upload file resource (audio/video/cover).

---

## Tổng quan luồng Takedown

1. API `takedown()` nhận `releaseId` + mảng `dspCodes` (takedown theo nền tảng)
2. Set `releaseEndDate = yesterday` → lưu DB
3. Load snapshot release (đã có endDate mới)
4. Tạo `ReleaseExecution` với `type = ExecutionType.TAKEDOWN`
5. Builder chỉ tạo step `PROCESS_DSPS` (bỏ GEN_UPC, GEN_ISRCS, VALIDATE)
6. XML được generate với:
    - ERN 3.8.2: `<UpdateIndicator>UpdateMessage</UpdateIndicator>` + bỏ `TechnicalSoundRecordingDetails` / `TechnicalImageDetails`
    - ERN 4.3: `<IsProvidedInDelivery>false</IsProvidedInDelivery>` (giữ TechnicalDetails nhưng báo không gửi file)
7. Upload chỉ XML + manifest lên SFTP (không có folder `resources/`)
8. Delivery status cuối cùng = `TAKEN_DOWN` thay vì `DISTRIBUTED`

---

## Chi tiết các file đã sửa

### 1. `src/modules/release/services/release.service.ts`

**Thay đổi:** Tách method `takedown()` riêng khỏi `submit3()`

**Lý do:** `submit3()` sẽ nullify `releaseEndDate` khi submit. Takedown cần set `releaseEndDate = yesterday` trước khi load snapshot, nên phải tách riêng.

**Logic:**

```typescript
async takedown(id, userId, dto) {
    // Sync CI data
    await this.releaseCiDataService.bulkSyncDataCi({ ids: [id] });

    // Set releaseEndDate = yesterday
    const releaseEndDate = new Date();
    releaseEndDate.setDate(releaseEndDate.getDate() - 1);
    await this.releaseRepo.update(id, { status: SUBMITTED, releaseEndDate });

    // Load snapshot SAU KHI update (để snapshot có endDate mới)
    const release = await this.releaseQueryService.findOneReleaseFull({ releaseId: id });

    // Tạo execution với type TAKEDOWN
    return this.releaseExecution3Service.newReleaseExecution({
        release,
        dspCodes: dto.code,
        type: ExecutionType.TAKEDOWN,
    });
}
```

---

### 2. `src/modules/release/modules/release-executions3/services/release-execution3.builder.ts`

**Thay đổi:** Khi `type === TAKEDOWN`, chỉ build step `PROCESS_DSPS` (bỏ GEN_UPC, GEN_ISRCS, VALIDATE)

**Lý do:** Takedown không cần generate UPC/ISRC mới, không cần validate lại release. Chỉ cần gửi metadata thông báo ngừng phân phối.

```typescript
case undefined: {
    let order = 1;
    if (releaseExecution.type === ExecutionType.TAKEDOWN) {
        stepResult.push({
            type: ReleaseExecutionStepType.PROCESS_DSPS,
            order: order++,
            childExecutionMode: 'parallel',
            isDeliveryStep: true,
            metadata: { input: { delivery: releaseExecution.metadata.input.delivery?.all } },
        });
        break;
    }
    // ... logic release bình thường giữ nguyên
}
```

---

### 3. `src/modules/release/modules/release-executions3/services/release-execution3.service.ts`

**Thay đổi:** Force `isSkipImport = false` khi takedown

**Lý do:** Release đã import CI thành công trước đó → `ciData.needImportAgain = false` → `isSkipImport = true` → skip IMPORT_CI. Nhưng takedown BẮT BUỘC phải import lại vì cần gửi XML mới (UpdateMessage) lên CI.

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

---

### 4. `src/modules/release/services/release-ddex.service.ts`

**Thay đổi:**

1. `createErnFile()` — thêm param `updateIndicator`
2. `createTakedownMetadataOnServer()` — truyền `updateIndicator: 'UpdateMessage'` (cho cả 3.8.2 và 4.3)

**Lý do:**

- `UpdateMessage` báo cho DSP/aggregator biết đây là update (takedown), không phải release mới
- Áp dụng cho MỌI ERN version, không chỉ 3.8.2

**`createErnFile` (thêm param):**

```typescript
createErnFile({ release, outputDir, ernVersion, sender, recipient, coverExtension, updateIndicator }) {
    const input = this.parseErnInputFromRelease({ ... });
    if (updateIndicator) {
        input.updateIndicator = updateIndicator;
    }
    const xmlContent = this.ernService2.generate(input);
    // ...
}
```

**`createTakedownMetadataOnServer` (không tạo folder resources):**

```typescript
async createTakedownMetadataOnServer({ release, ernVersion, recipient, sender, dspCode }) {
    const batchId = genBatchId();
    // ...
    fs.mkdirSync(releaseDir, { recursive: true }); // KHÔNG tạo resources/

    const xml = this.createErnFile({
        release, outputDir: releaseDir, ernVersion, recipient, sender,
        coverExtension: undefined,
        updateIndicator: 'UpdateMessage',  // luôn set cho takedown
    });
    // ...
}
```

---

### 5. `src/modules/ern2/builders/ern382.builder.ts`

**Thay đổi:** Khi `updateIndicator === 'UpdateMessage'`, bỏ `<TechnicalSoundRecordingDetails>` và `<TechnicalImageDetails>`

**Lý do:**

- `TechnicalSoundRecordingDetails` chứa `<File><FileName>track.wav</FileName></File>` → CI tìm file trên SFTP → không thấy → reject
- `TechnicalImageDetails` chứa `<File><FileName>cover.jpg</FileName></File>` → CI tìm packshot → không thấy → reject "Could not find packshot file"
- Bỏ hẳn tag technical thì CI không tìm file, `<ResourceList>` vẫn có (với SoundRecording metadata: ISRC, title, duration, artists...) nên schema valid

```typescript
// Technical details — skip for takedown (UpdateMessage)
if (this.input.updateIndicator !== 'UpdateMessage') {
	const tech = details.ele('TechnicalSoundRecordingDetails');
	// ... codec, bitrate, filename, hash ...
}
```

```typescript
// Technical details — skip for takedown (UpdateMessage)
if (this.input.updateIndicator !== 'UpdateMessage') {
	const tech = details.ele('TechnicalImageDetails');
	// ... codec, dimensions, filename, hash ...
}
```

**Kết quả XML takedown ERN 3.8.2:**

```xml
<ResourceList>
    <SoundRecording>
        <SoundRecordingId><ISRC>...</ISRC></SoundRecordingId>
        <ResourceReference>A1</ResourceReference>
        <ReferenceTitle>...</ReferenceTitle>
        <Duration>PT03M16S</Duration>
        <SoundRecordingDetailsByTerritory>
            <TerritoryCode>Worldwide</TerritoryCode>
            <Title>...</Title>
            <DisplayArtist>...</DisplayArtist>
            <!-- KHÔNG CÓ TechnicalSoundRecordingDetails -->
        </SoundRecordingDetailsByTerritory>
    </SoundRecording>
    <Image>
        <ImageDetailsByTerritory>
            <TerritoryCode>Worldwide</TerritoryCode>
            <!-- KHÔNG CÓ TechnicalImageDetails -->
        </ImageDetailsByTerritory>
    </Image>
</ResourceList>
```

---

### 6. `src/modules/ern2/builders/ern43.builder.ts`

**Thay đổi:** Khi `updateIndicator === 'UpdateMessage'`, set `<IsProvidedInDelivery>false</IsProvidedInDelivery>` (thay vì `true`)

**Lý do:** ERN 4.3 dùng cơ chế khác — giữ `TechnicalDetails` nhưng dùng `IsProvidedInDelivery` để báo file không được gửi kèm. DSP (Spotify) đọc flag này biết không cần tìm file trên SFTP.

```typescript
// Audio track
deliveryFile
	.ele('IsProvidedInDelivery')
	.txt(this.input.updateIndicator === 'UpdateMessage' ? 'false' : 'true');

// Video
deliveryFile
	.ele('IsProvidedInDelivery')
	.txt(this.input.updateIndicator === 'UpdateMessage' ? 'false' : 'true');
```

---

### 7. `src/modules/release/modules/release-executions3/services/release-execution3.engine.ts`

**Thay đổi:** `mapStepStatusToDeliveryStatus` trả `TAKEN_DOWN` thay vì `DISTRIBUTED` khi execution type là TAKEDOWN

**Lý do:** Khi delivery step hoàn thành (DONE), cần phân biệt: release bình thường → DISTRIBUTED, takedown → TAKEN_DOWN.

```typescript
if (stepStatus === ReleaseExecutionStepStatus.DONE) {
	return executionType === ExecutionType.TAKEDOWN
		? ReleaseDspStatus.TAKEN_DOWN
		: ReleaseDspStatus.DISTRIBUTED;
}
```

---

### 8. `src/modules/release/modules/release-executions3/services/release-execution3.worker.ts`

**Thay đổi:** `createMetadataOnServer` dispatch sang `createTakedownMetadataOnServer` khi takedown

**Lý do:** Takedown không download/upload resource files, chỉ tạo XML.

```typescript
const isTakedown = releaseExecution.type === ExecutionType.TAKEDOWN;
const { outputDir, batchId, releaseReference, xml } = isTakedown
    ? await this.releaseDdexService.createTakedownMetadataOnServer({ ... })
    : await this.releaseDdexService.createMetadataOnServer({ ... });
```

---

## Luồng chạy takedown (pipeline steps)

### Direct DSP (ví dụ Spotify - ERN 4.3):

```
PROCESS_DSPS [parallel, delivery]
└── PROCESS_DIRECT [parallel]
    └── PROCESS_DIRECT_CHILD [sequential]
        ├── CREATE_METADATA_ON_SERVER  → tạo XML (IsProvidedInDelivery=false)
        ├── UPLOAD_METADATA_TO_SFTP    → upload XML lên SFTP DSP
        ├── WAIT_PARTNER_PROCESS       → chờ DSP xử lý
        └── SYNC_DATA_PARTNER          → sync kết quả
```

### Aggregator CI (ERN 3.8.2):

```
PROCESS_DSPS [parallel, delivery]
└── PROCESS_AGG [parallel]
    └── PROCESS_AGG_CI [delivery]
        ├── IMPORT_CI [sequential]         ← KHÔNG skip (force isSkipImport=false)
        │   ├── CREATE_METADATA_ON_SERVER  → tạo XML (bỏ TechnicalDetails)
        │   ├── UPLOAD_METADATA_TO_SFTP    → upload XML lên SFTP CI
        │   ├── CREATE_FOLDER_DONE_CI      → signal CI xử lý batch
        │   ├── WAIT_PARTNER_PROCESS       → chờ CI xử lý
        │   ├── GET_RESULT_IMPORT_CI       → check kết quả import
        │   └── VALIDATE_QA_CI             → validate QA
        ├── EXPORT_CI [parallel]           → admin trigger export lên CI Tool
        ├── WAIT_PARTNER_PROCESS           → chờ 1 ngày cho CI deliver ra DSP
        └── SYNC_DATA_DSP_CI              → sync status từng DSP
```

---

## Lỗi CI đã gặp và giải quyết

| Batch             | Lỗi                                                     | Nguyên nhân                                                 | Fix                                                         |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| 20260808094610948 | Schema: ReleaseList not expected, expected ResourceList | Bỏ hết resource → `<ResourceList>` rỗng/missing             | Giữ ResourceList, chỉ bỏ TechnicalDetails                   |
| 20260808131720366 | AudioCodecType not specified for file ''                | Bỏ `audioFile` data → TechnicalSoundRecordingDetails rỗng   | Giữ metadata đầy đủ, chỉ bỏ TechnicalDetails khi takedown   |
| 20260808135340350 | Could not find packshot file: resources/xxx.jpg         | XML reference file nhưng file không có trên SFTP            | Bỏ TechnicalImageDetails (không có FileName → CI không tìm) |
| 20260808135340350 | Track count mismatch (20 vs 30)                         | Data trong hệ thống (30 tracks) khác với bên CI (20 tracks) | Vấn đề data, không phải code                                |

---

## Lưu ý quan trọng

1. **ERN Schema**: `<ResourceList>` PHẢI có trong XML. Bỏ nó = schema invalid. Chỉ bỏ các tag technical bên trong.

2. **ERN 3.8.2 vs 4.3**: Cơ chế khác nhau:
    - 3.8.2: Bỏ hẳn `TechnicalSoundRecordingDetails` / `TechnicalImageDetails`
    - 4.3: Giữ `TechnicalDetails` nhưng `IsProvidedInDelivery = false`

3. **CI validate**: CI kiểm tra file tồn tại trên SFTP dựa vào `<FileName>` trong XML. Nếu không có tag FileName → không check.

4. **isSkipImport**: Release đã import thành công sẽ có `needImportAgain = false`. Takedown PHẢI override để force import lại.

5. **SFTP credentials**: Private key nhập vào DB dạng 1 dòng, thay newline bằng `\n` literal:

    ```
    -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...\n...\n-----END RSA PRIVATE KEY-----
    ```

6. **Delivery status**: Engine tự map `DONE` → `TAKEN_DOWN` khi execution type là TAKEDOWN. Nhưng `SYNC_DATA_DSP_CI` ghi status từ CI API (có thể override thành DISTRIBUTED) — cần lưu ý.

---

## Các vấn đề chưa giải quyết

1. **SYNC_DATA_DSP_CI override status**: Step này map status từ CI API → có thể trả `DISTRIBUTED` thay vì `TAKEN_DOWN`. Nếu cần, có thể thêm logic check executionType tương tự engine.
