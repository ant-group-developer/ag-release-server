# Release Report Import Service

## Mục đích

`ReleaseReportImportService.importRelease` tạo một release tối giản từ dữ liệu
report, cùng với artist chính, danh sách track và các quan hệ artist.

Luồng không ghi đè dữ liệu release đã tồn tại. UPC và ISRC được dùng làm khóa
nghiệp vụ để tránh import trùng. Nếu UPC hoặc bất kỳ ISRC nào đã tồn tại thì
toàn bộ report sẽ được bỏ qua.

## Input

```ts
interface ReleaseReportImportInput {
	upc: string;
	tenantId?: string;
	labelId?: string;
	labelName?: string;
	title: string;
	artistName: string;
	tracks: {
		title: string;
		isrc: string;
	}[];
}
```

Ý nghĩa các trường:

- `upc`: Mã nghiệp vụ dùng để kiểm tra release đã tồn tại.
- `tenantId`: Tenant sở hữu release mới và giới hạn phạm vi tìm label.
- `labelId`: ID label, được ưu tiên tìm trước.
- `labelName`: Tên label dùng để tìm hoặc tạo label mới.
- `title`: Tiêu đề của release mới.
- `artistName`: Artist chính dùng chung cho release và tất cả track.
- `tracks`: Danh sách track được tạo theo đúng thứ tự input, bắt đầu từ
  `order = 1`.

## Thứ tự xử lý

### 1. Kiểm tra UPC

Service tìm release theo UPC từ input.

- Tìm thấy: trả về release hiện có ngay lập tức.
- Không tìm thấy: tiếp tục kiểm tra ISRC.

Release hiện có không bị cập nhật từ dữ liệu report.

### 2. Kiểm tra ISRC

Các ISRC từ input được trim, loại bỏ giá trị rỗng và loại bỏ giá trị trùng nhau.

Nếu bất kỳ ISRC nào đã thuộc về một track trong hệ thống:

- Bỏ qua toàn bộ report.
- Không tạo hoặc cập nhật label, artist, release hay track.
- Trả về release đang sở hữu track khớp đầu tiên theo `createdAt`.

### 3. Kiểm tra lại trong transaction

UPC và ISRC được kiểm tra lại bên trong transaction nhằm giảm khả năng tạo dữ
liệu trùng khi nhiều report được xử lý gần như đồng thời.

Việc kiểm tra hai lần chỉ giúp giảm race condition. Muốn ngăn tuyệt đối cần có
unique constraint phù hợp tại database cho các khóa nghiệp vụ.

## Xác định tenant và label

Service luôn ưu tiên tìm label theo `labelId`. Nếu không tìm thấy theo ID thì
tiếp tục tìm theo `labelName`, không phân biệt chữ hoa và chữ thường.

### Có truyền tenantId

1. Kiểm tra tenant có tồn tại hay không.
2. Nếu tenant không tồn tại, sử dụng tenant và label fallback.
3. Tìm label theo ID trong tenant.
4. Nếu không thấy, tìm label theo tên trong tenant.
5. Nếu vẫn không thấy và có `labelName`, tạo label mới trong tenant.
6. Nếu không thể tìm hoặc tạo label, sử dụng tenant và label fallback.

Label mới được tạo với:

```text
name = labelName sau khi trim
code = labelName đã chuẩn hóa, thêm hậu tố ngẫu nhiên nếu bị trùng
tenantId = tenantId từ input
isImportedFromReport = true
```

### Không truyền tenantId

1. Tìm label theo `labelId` trên toàn hệ thống.
2. Nếu không thấy, tìm label theo `labelName` trên toàn hệ thống.
3. Lấy `tenantId` từ label tìm được để gán cho release.
4. Nếu không tìm thấy label, sử dụng tenant và label fallback.

Nếu có nhiều label trùng tên ở các tenant khác nhau, service sử dụng label được
tạo sớm nhất theo `createdAt`.

Nếu truyền cả `labelId` và `labelName`, `labelId` được ưu tiên. `labelName` chỉ
được dùng khi không tìm thấy label theo ID.

### Tenant và label fallback

```text
Tenant: ANT MUSIC LLC
Tenant ID: 7c2358a0-1a38-4a10-b806-a1531ef71b0c

Label: AMG
Label ID: G4_9DtvlmL
```

Label fallback phải thuộc tenant fallback. Nếu tenant hoặc label không tồn tại,
hoặc label không thuộc đúng tenant, quá trình import sẽ throw
`NotFoundException`.

## Xác định artist

Artist được tìm trên toàn hệ thống theo `artistName` sau khi trim, không phân
biệt chữ hoa và chữ thường.

- Artist đã tồn tại: sử dụng lại và không thay đổi cờ import.
- Artist chưa tồn tại: tạo mới với `ArtistSource.ANT_MUSIC`, code ngẫu nhiên và
  `isImportedFromReport = true`.

Nếu có nhiều artist trùng tên, service sử dụng artist được tạo sớm nhất theo
`createdAt`.

## Dữ liệu được tạo

Sau khi xác định tenant, label và artist, transaction tạo các dữ liệu sau.

### Release

```text
upc
title
tenantId
labelId
isImportedFromReport = true
```

### Release artist

```text
releaseId
artistId
addArtistToTracks = true
isImportedFromReport = true
```

### Track

Mỗi track trong input tạo một record:

```text
releaseId
title
isrc
order = vị trí trong input + 1
copyArtistsFromRelease = true
isImportedFromReport = true
```

### Track artist

Mỗi track được liên kết với artist chính:

```text
trackId
artistId
releaseArtistId
isFromReleaseAction = true
isImportedFromReport = true
```

## Cờ import từ report

Các bảng sau có trường `is_imported_from_report`:

- `labels`
- `artists`
- `releases`
- `release_artist`
- `tracks`
- `track_artist`

Giá trị mặc định tại database là `false`. Chỉ các record thực sự được tạo bởi
luồng import report mới được gán `true`.

Label và artist đã tồn tại được sử dụng lại sẽ không bị thay đổi cờ import.

## Transaction và giá trị trả về

Việc tạo label, artist, release và các quan hệ được thực hiện trong cùng một
transaction. Nếu bất kỳ thao tác nào thất bại, toàn bộ dữ liệu mới của lần
import đó sẽ rollback.

Hàm có thể trả về:

- Release đã tồn tại theo UPC.
- Release đang sở hữu ISRC đã tồn tại.
- Release vừa được tạo mới.

Các relation không được load lại trước khi trả về.
