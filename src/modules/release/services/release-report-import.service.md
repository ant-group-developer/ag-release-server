# Release Report Import Service

## Mục đích

`ReleaseReportImportService` dùng để tạo một release tối giản từ dữ liệu report.

Service hoạt động theo nguyên tắc idempotent theo UPC:

- Nếu UPC đã tồn tại, trả về release hiện có và không cập nhật dữ liệu.
- Nếu UPC chưa tồn tại, tạo release cùng artist, tracks và các quan hệ artist.

## Input

```ts
interface ReleaseReportImportInput {
	upc: string;
	labelName?: string;
	labelId?: string;
	title: string;
	artistName: string;
	tracks: {
		title: string;
		isrc: string;
	}[];
}
```

Ví dụ:

```ts
await releaseReportImportService.importRelease({
	upc: '123456789012',
	labelName: 'Example Label',
	title: 'Example Release',
	artistName: 'Example Artist',
	tracks: [
		{
			title: 'Track One',
			isrc: 'USABC2600001',
		},
	],
});
```

## Luồng xử lý

### 1. Kiểm tra UPC

Service tìm release theo `upc`.

- Tìm thấy: trả release hiện có, không thay đổi release, artist hoặc tracks.
- Không tìm thấy: bắt đầu transaction để tạo dữ liệu.

Trong transaction, UPC được kiểm tra lại nhằm giảm khả năng tạo trùng khi có
nhiều request chạy gần nhau.

### 2. Resolve label

Label được tìm theo thứ tự ưu tiên:

1. Tìm theo `labelId` nếu input có truyền.
2. Nếu ID không được truyền hoặc không tìm thấy, tìm theo `labelName`.
3. Nếu vẫn không tìm thấy, dùng `REPORT_IMPORT_FALLBACK_LABEL_ID`.

Tìm theo tên không phân biệt chữ hoa và chữ thường.

Fallback hiện tại:

```ts
export const REPORT_IMPORT_FALLBACK_LABEL_ID = 'CHANGE_ME_';
```

Cần thay giá trị này bằng ID label mặc định thực tế trước khi sử dụng.
Fallback label phải tồn tại trong bảng `labels`, nếu không service sẽ throw
error.

`release.labelId` và `release.tenantId` đều được lấy từ label đã resolve.

### 3. Resolve artist

Service tìm artist theo `artistName`, không phân biệt chữ hoa và chữ thường.

- Nếu tìm thấy, dùng artist hiện có.
- Nếu không tìm thấy, tạo artist mới với source `ANT_MUSIC`.

Artist này được dùng cho cả release và tất cả tracks trong input.

### 4. Tạo release

Release mới được tạo với các dữ liệu chính:

```text
upc
title
labelId
tenantId
```

Các field còn lại sử dụng default hoặc nullable theo entity hiện tại.

### 5. Tạo release artist

Service tạo một record `release_artist` liên kết artist với release:

```text
releaseId
artistId
addArtistToTracks = true
```

### 6. Tạo tracks và track artists

Mỗi phần tử trong `tracks` tạo một record `tracks`:

```text
releaseId
title
isrc
order
copyArtistsFromRelease = true
```

`order` bắt đầu từ `1` theo thứ tự input.

Mỗi track được liên kết với cùng artist thông qua `track_artist`. Quan hệ này
tham chiếu tới `release_artist` vừa tạo và được đánh dấu:

```text
isFromReleaseAction = true
```

## Transaction

Các thao tác sau nằm trong cùng một transaction:

- Resolve hoặc tạo artist.
- Tạo release.
- Tạo release artist.
- Tạo tracks.
- Tạo track artists.

Nếu một thao tác thất bại, toàn bộ dữ liệu mới trong lần import sẽ rollback.

## Giá trị trả về

Hàm trả về `Release`:

- Release hiện có nếu UPC đã tồn tại.
- Release vừa tạo nếu UPC chưa tồn tại.

Service không tự load lại các relations như `tracks` hoặc `releaseArtists`
trước khi trả về.

## Lưu ý

- Bảng `releases` hiện chưa có unique constraint cho UPC. Việc kiểm tra UPC hai
  lần không bảo đảm tuyệt đối trước hai transaction chạy đồng thời.
- Nếu nghiệp vụ yêu cầu chống trùng tuyệt đối, cần làm sạch dữ liệu UPC hiện có
  và thêm unique index/constraint tại database.
- Khi có nhiều label trùng tên giữa các tenant, service chọn label được tạo sớm
  nhất. Input hiện chưa có `tenantId` để giới hạn việc tìm label.
- Service chỉ hỗ trợ một `artistName` chung cho release và toàn bộ tracks.
- Release đã tồn tại sẽ không được bổ sung tracks hoặc sửa metadata từ report.
