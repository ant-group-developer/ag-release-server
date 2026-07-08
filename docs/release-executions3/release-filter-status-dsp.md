# Release Filter - Status DSP

File này mô tả phần filter release theo trạng thái DSP delivery trong module release.

Code liên quan:

- DTO: `src/modules/release/dto/release.dto.ts`
- Controller: `src/modules/release/controllers/release.controller.ts`
- Query service: `src/modules/release/services/release.query.service.ts`
- Entity status: `src/modules/release/enum/release-dsp.enum.ts`

## 1. Status DSP là gì

Status DSP nằm ở bảng `release_dsp_delivery`, field `status`.

Enum hiện tại:

```ts
export enum ReleaseDspStatus {
	DRAFT = 'draft',
	NEVER_DISTRIBUTED = 'never_distributed',
	PROCESSING = 'processing',
	ISSUES = 'issues',
	DISTRIBUTED = 'distributed',
	TAKEN_DOWN = 'taken_down',
}
```

Một release có nhiều bản ghi `release_dsp_delivery`, mỗi bản ghi tương ứng với một DSP.

Ví dụ:

| release | DSP | status |
| --- | --- | --- |
| R1 | SPOTIFY | distributed |
| R1 | APPLE_MUSIC | issues |
| R1 | YOUTUBE_MUSIC | never_distributed |

Khi filter release theo status DSP, ta không filter trực tiếp trên release status. Ta filter theo trạng thái của từng DSP delivery.

## 2. API release list có nhận filter DSP delivery

Các API list release dùng `QueryGetListReleaseDto` có thể nhận `dspDelivery`:

```ts
dspDelivery?: QueryReleaseDspDeliveryDto;
```

Controller hiện có:

```http
GET /releases
POST /releases/get-list
GET /releases/simple
```

`GET /releases` nhận query string.

`POST /releases/get-list` nhận body, phù hợp hơn khi filter phức tạp.

## 3. DTO filter

```ts
export class QueryReleaseDspDeliveryItemDto {
	code: string;
	status: ReleaseDspStatus[];
}

export class QueryReleaseDspDeliveryDto {
	include?: QueryReleaseDspDeliveryItemDto[];
	exclude?: QueryReleaseDspDeliveryItemDto[];
}
```

Ý nghĩa:

| Field | Ý nghĩa |
| --- | --- |
| `include` | Release phải có ít nhất một DSP delivery match một cặp `code + status[]` |
| `exclude` | Release không được có DSP delivery match một cặp `code + status[]` |

Mỗi item gồm:

| Field | Ý nghĩa |
| --- | --- |
| `code` | DSP code, được trim và uppercase trước khi so sánh |
| `status` | Mảng status được phép match |

## 4. Logic include

Ví dụ body:

```json
{
	"dspDelivery": {
		"include": [
			{
				"code": "SPOTIFY",
				"status": ["distributed"]
			}
		]
	}
}
```

Ý nghĩa:

Lấy các release có delivery của `SPOTIFY` và delivery đó đang `distributed`.

Nếu truyền nhiều item:

```json
{
	"dspDelivery": {
		"include": [
			{
				"code": "SPOTIFY",
				"status": ["distributed"]
			},
			{
				"code": "APPLE_MUSIC",
				"status": ["issues", "never_distributed"]
			}
		]
	}
}
```

Ý nghĩa:

Release match nếu tồn tại một trong các điều kiện:

- `SPOTIFY` đang `distributed`
- hoặc `APPLE_MUSIC` đang `issues` / `never_distributed`

Trong code, service build điều kiện bằng `EXISTS`.

```sql
EXISTS (
	SELECT 1
	FROM release_dsp_delivery delivery
	INNER JOIN dsps dsp ON dsp.id = delivery.dsp_id
	WHERE delivery.release_id = release.id
		AND (
			UPPER(TRIM(dsp.code)) = :code
			AND delivery.status IN (:...status)
		)
)
```

## 5. Logic exclude

Ví dụ body:

```json
{
	"dspDelivery": {
		"exclude": [
			{
				"code": "SPOTIFY",
				"status": ["distributed"]
			}
		]
	}
}
```

Ý nghĩa:

Loại các release có `SPOTIFY` đang `distributed`.

Trong code, exclude là `NOT EXISTS`.

```sql
NOT EXISTS (...)
```

## 6. Kết hợp include và exclude

Ví dụ:

```json
{
	"dspDelivery": {
		"include": [
			{
				"code": "SPOTIFY",
				"status": ["issues", "never_distributed"]
			}
		],
		"exclude": [
			{
				"code": "APPLE_MUSIC",
				"status": ["processing"]
			}
		]
	}
}
```

Ý nghĩa:

Lấy release có `SPOTIFY` đang lỗi/chưa distributed, đồng thời không có `APPLE_MUSIC` đang processing.

## 7. Cách truyền qua GET query

Với `GET /releases`, `dspDelivery` được parse bằng `parseJsonObjectQueryValue`, nên có thể truyền JSON string.

Ví dụ:

```http
GET /releases?dspDelivery={"include":[{"code":"SPOTIFY","status":["issues","never_distributed"]}]}
```

Thực tế khi gọi từ browser/client nên URL encode JSON.

```http
GET /releases?dspDelivery=%7B%22include%22%3A%5B%7B%22code%22%3A%22SPOTIFY%22%2C%22status%22%3A%5B%22issues%22%2C%22never_distributed%22%5D%7D%5D%7D
```

Với filter phức tạp, nên dùng `POST /releases/get-list`.

## 8. Cách truyền qua POST body

```http
POST /releases/get-list
Content-Type: application/json
```

```json
{
	"page": 1,
	"pageSize": 20,
	"dspDelivery": {
		"include": [
			{
				"code": "SPOTIFY",
				"status": ["issues", "never_distributed"]
			}
		]
	}
}
```

## 9. Lưu ý quan trọng

- `code` được `trim()` và `toUpperCase()` trước khi so sánh.
- Item thiếu `code` hoặc `status` rỗng sẽ bị bỏ qua.
- `include` nhiều item là quan hệ OR trong cùng nhóm include.
- `exclude` nhiều item là loại release nếu match bất kỳ item nào.
- Nếu có cả include và exclude thì query áp dụng cả hai.
- Filter này chỉ lọc release theo DSP delivery, không tự đổi status.
- Status thật được cập nhật bởi các flow submit/execution/result sync.

