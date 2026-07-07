# Release Bulk Submit API

File này mô tả API bulk submit release và preview kết quả DSP status trước khi submit.

Code liên quan:

- Controller: `src/modules/release/controllers/release.controller.ts`
- Service: `src/modules/release/services/release.service.ts`
- DTO: `src/modules/release/dto/release.dto.ts`
- Submit DTO: `src/modules/release/dto/submit-release.dto.ts`
- Execution module: `src/modules/release/modules/release-executions3`

## 1. API

| Method | Path | Mục đích |
| --- | --- | --- |
| `POST` | `/releases/bulk-submit/preview-result` | Preview DSP nào sẽ được submit, DSP nào bị skip |
| `POST` | `/releases/bulk-submit` | Submit nhiều release theo cùng bộ DSP code |

`bulk-submit` có permission:

```ts
Permission.RELEASE_AUDIO.UPDATE
Permission.RELEASE_VIDEO.UPDATE
```

## 2. Request body

DTO: `BulkSubmitReleaseDto`

```ts
export class BulkSubmitReleaseDto {
	ids: string[];
	idsExclude?: string[];
	codes: string[];
	status?: ReleaseDspStatus = ReleaseDspStatus.DISTRIBUTED;
	skipDistributed?: boolean = true;
	ciImportAction?: CiImportAction = CiImportAction.SKIP_CI_IMPORT;
}
```

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `ids` | Có | Danh sách release ID cần xử lý |
| `idsExclude` | Không | Release ID cần bỏ qua trong danh sách `ids` |
| `codes` | Có | Danh sách DSP code muốn submit |
| `status` | Không | Target status gắn vào preview, mặc định `distributed` |
| `skipDistributed` | Không | Nếu `true`, DSP đã `distributed` sẽ không submit lại |
| `ciImportAction` | Không | Cách xử lý trạng thái CI trong snapshot submit |

Ví dụ:

```json
{
	"ids": [
		"6f7840b8-fcb7-4cc6-a483-b3087e6fc001",
		"2ab2c6c7-4f7e-460c-a8fb-7d6e0c67f002"
	],
	"idsExclude": [],
	"codes": ["SPOTIFY", "APPLE_MUSIC"],
	"status": "distributed",
	"skipDistributed": true,
	"ciImportAction": "SKIP_CI_IMPORT"
}
```

## 3. Preview API

```http
POST /releases/bulk-submit/preview-result
```

Preview dùng chung DTO `BulkSubmitReleaseDto`.

Service gọi:

```ts
releaseService.previewBulkSubmitResult(dto)
```

Luồng chính:

1. Chuẩn hóa `codes`: trim và uppercase.
2. Build map `targetStatusByDspCode`.
3. Load release đầu tiên trong `dto.ids` bằng `findOneReleaseFull`.
4. Apply `ciImportAction` vào snapshot release.
5. Duyệt `release.releaseDspDeliveries`.
6. Nếu delivery thuộc DSP cần submit và không bị skip, gắn thêm `targetStatus`.
7. Trả về release snapshot kèm `submitData`.

Điểm cần chú ý:

Preview hiện tại đọc `dto.ids[0]`. Vì vậy preview phù hợp để xem kết quả cho một release cụ thể.

## 4. Điều kiện DSP được submit

Một DSP delivery được đưa vào `submitData.code` khi:

- DSP code nằm trong `dto.codes`.
- `targetStatus` tồn tại.
- Nếu `skipDistributed = true`, delivery hiện tại không được là `distributed`.

Code logic:

```ts
const shouldChangeStatus =
	targetStatus &&
	(!(dto.skipDistributed ?? true) ||
		status !== ReleaseDspStatus.DISTRIBUTED);
```

Ý nghĩa:

| `skipDistributed` | Status hiện tại | Có submit lại không |
| --- | --- | --- |
| `true` | `distributed` | Không |
| `true` | khác `distributed` | Có |
| `false` | `distributed` | Có |
| `false` | khác `distributed` | Có |

## 5. `submitData` trả về từ preview

Preview trả về release và field:

```ts
submitData: {
	id: release.id,
	code: submitCodes,
	skipCodes,
	ciImportAction: dto.ciImportAction,
}
```

| Field | Ý nghĩa |
| --- | --- |
| `id` | Release ID |
| `code` | DSP code sẽ submit thật |
| `skipCodes` | DSP code nằm trong request nhưng bị skip, thường do đã `distributed` |
| `ciImportAction` | Action CI sẽ truyền tiếp vào submit |

Ví dụ response rút gọn:

```json
{
	"id": "6f7840b8-fcb7-4cc6-a483-b3087e6fc001",
	"title": "Demo Release",
	"submitData": {
		"id": "6f7840b8-fcb7-4cc6-a483-b3087e6fc001",
		"code": ["APPLE_MUSIC"],
		"skipCodes": ["SPOTIFY"],
		"ciImportAction": "SKIP_CI_IMPORT"
	}
}
```

Trong ví dụ này `SPOTIFY` bị skip vì đã `distributed`, còn `APPLE_MUSIC` sẽ được submit.

## 6. Bulk submit thật

```http
POST /releases/bulk-submit
```

Service gọi:

```ts
releaseService.bulkSubmit(dto)
```

Luồng chính:

1. Tạo `idsExclude` thành `Set`.
2. Duyệt từng ID trong `dto.ids`.
3. Nếu ID nằm trong `idsExclude`, bỏ qua.
4. Gọi `previewBulkSubmitResult({ ...dto, ids: [id] })`.
5. Lấy `submitData` từ preview.
6. Gọi `submit3(id, submitData)`.
7. `submit3` cập nhật release status sang `submitted`.
8. `submit3` tạo `ReleaseExecution3` với type `INITIAL_RELEASE`.

Code rút gọn:

```ts
for (const id of dto.ids) {
	if (idsExclude.has(id)) continue;

	const { submitData } = await this.previewBulkSubmitResult({
		...dto,
		ids: [id],
	});

	await this.submit3(id, submitData);
}
```

## 7. Quan hệ với Release Execution 3

Bulk submit không tự xử lý DSP delivery đến cuối.

Bulk submit chỉ chuẩn bị danh sách DSP cần submit rồi gọi:

```ts
submit3(id, submitData)
```

`submit3` sẽ:

1. Load full release.
2. Apply `ciImportAction` vào snapshot.
3. Update release status thành `submitted`.
4. Gọi `releaseExecution3Service.newReleaseExecution`.

Sau đó module `release-executions3` chịu trách nhiệm:

- build cây step theo DSP;
- chạy queue/consumer/engine/worker;
- xử lý direct/aggregator/CI/State51;
- ghi result;
- sync status cuối về `release_dsp_delivery`.

## 8. `ciImportAction`

Enum:

```ts
export enum CiImportAction {
	KEEP_CURRENT_STATUS = 'KEEP_CURRENT_STATUS',
	SKIP_CI_IMPORT = 'SKIP_CI_IMPORT',
	FORCE_CI_IMPORT = 'FORCE_CI_IMPORT',
}
```

Trong `bulk-submit`, default DTO là:

```ts
ciImportAction = CiImportAction.SKIP_CI_IMPORT
```

`applyCiImportActionToReleaseSnapshot` chỉ sửa snapshot dùng cho execution, không update trực tiếp release gốc.

Logic hiện tại:

| Action | Hiệu ứng trên snapshot CI |
| --- | --- |
| `SKIP_CI_IMPORT` | Nếu CI status đang `EXISTS_ON_CI` thì giữ `EXISTS_ON_CI` |
| `FORCE_CI_IMPORT` | Set CI status snapshot thành `NOT_FOUND_ON_CI` để buộc import |
| `KEEP_CURRENT_STATUS` | Giữ nguyên status hiện tại |

## 9. Lưu ý khi dùng API

- `codes` nên truyền DSP code đúng với bảng `dsps.code`; service sẽ trim và uppercase khi preview.
- `bulk-submit` chạy tuần tự từng release, không chạy song song trong hàm service.
- Nếu một release lỗi khi submit, hiện tại vòng lặp sẽ throw và dừng tại lỗi đó.
- Response của `bulk-submit` là `common.processing`, không trả chi tiết từng release.
- Muốn xem trước DSP nào sẽ bị skip, gọi `preview-result` trước.
- Status thật cuối cùng của DSP không đến từ request `status` ngay lập tức; status sẽ được sync sau khi execution chạy xong.

