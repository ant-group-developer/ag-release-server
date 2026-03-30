# TOÀN TẬP TIÊU CHUẨN MÃ NGUỒN (CODE GUIDELINES)

Tài liệu này là **bộ luật tối cao** quy định Cấu trúc, Cách tổ chức code, Naming Convention, và Dòng chảy dữ liệu (Data Flow) khi khởi tạo module mới trong dự án. Tài liệu này được trích xuất từ các base form chuẩn nhất của dự án (cụ thể là module `distribution`). AI/Developer khi code module mới **bắt buộc phải copy 100% form mẫu** trong này.

---

## 1. Cấu Trúc Thư Mục (Folder Structure)
Mỗi module mới nằm trong `src/modules/[module-name]/` (hoặc là sub-module bên trong module lớn). Cấu trúc bắt buộc như sau:

```text
[module-name]/
├── const/
│   └── [module-name].const.ts      # Khai báo Exception và Success Response
├── dto/
│   └── [module-name].dto.ts        # Các class DTO (Create, Update, GetList...)
├── entities/
│   └── [module-name].entity.ts     # TypeORM Entity
├── enum/
│   └── [module-name].enum.ts       # Enum và FieldOrder cho Query
├── services/
│   ├── [module-name].service.ts       # Service xử lý Cập nhật/Sinh dữ liệu (Mutations)
│   └── [module-name].query.service.ts # Service xử lý Lấy và Tìm kiếm dữ liệu (Queries)
├── [module-name].controller.ts
└── [module-name].module.ts
```

---

## 2. Tiêu Chuẩn Naming (Naming Convention)
- **Tên thư mục/file**: Luôn sử dụng kebab-case chữ thường (Ví dụ: `dsp-routing-config.controller.ts`).
- **Table Name (CSDL)**: Dùng chuỗi snake_case và chia ở số nhiều (Ví dụ: `aggregators`, `dsp_routing_configs`).
- **Class / Decorator**: PascalCase (Ví dụ: `AggregatorQueryService`).

---

## 3. Quy tắc khai báo Entity (TypeORM)
Tất cả Entity chính mang yếu tố nghiệp vụ quan trọng đều phải kế thừa `BaseUserTrackedUUIDEntity` từ `src/common/entities/user-tracked.entity` (để tự động hóa ID, thời gian tạo, người tạo, ngày cập nhật).

**Code Pattern chuẩn:**
```typescript
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Entity, Column } from 'typeorm';

@Entity({ name: 'aggregators' }) // Luôn snake_case số nhiều
export class Aggregator extends BaseUserTrackedUUIDEntity {
	// Dùng const chuẩn để chặn length: DEFAULT_LENGTH_NAME, DEFAULT_LENGTH_CODE
	@Column({ type: 'varchar', length: 255 })
	name: string;

    // Chú ý với column name khác tên biến
	@Column({ type: 'int', name: 'dsp_usage_count', default: 0 })
	dspUsageCount: number;
}
```

---

## 4. Quy tắc khai báo DTOs & Validation
- **Luôn import từ `class-validator` và `@nestjs/swagger`**.
- File DTO thường bao gồm 3 class: `Create...Dto`, `Update...Dto`, và `GetList...Dto`.

**Code Pattern chuẩn:**
```typescript
import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';

export class CreateModelDto {
	@IsString()
	@IsNotEmpty()
	name: string;
}

// 1. DTO Update luôn wrap PartialType của Create
export class UpdateModelDto extends PartialType(CreateModelDto) {}

// 2. DTO Query List phải luôn kế thừa BaseQueryDto2 (có phân trang)
export class GetListModelDto extends BaseQueryDto2 {
	@IsOptional()
	fieldOrder: FieldOrderEnum = FieldOrderEnum.name;

	@IsOptional()
	orderBy: OrderDirection = OrderDirection.ASC;
}
```

---

## 5. Quy tắc khai báo Service: "CQRS Light Pattern"
Tránh nhồi tất cả code vào một class. Phải tách biệt tác vụ ĐỌC và TẠO MỚI.

### 5.1. Query Service (Chỉ dành để fetch List/Detail)
- Return kết quả phân trang bằng thể thức `new PageDto({ items, metadata })`.
- Dùng Builder `createQueryBuilder(OrmAlias.aliasName)`.
- Áp dụng search logic bằng hàm helper tiện ích `orderAndPaging2` từ `src/modules/orm/utils/orm.utils`.

**Code Pattern chuẩn:**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';

@Injectable()
export class ModelQueryService {
	constructor(@InjectRepository(ModelEntity) private repo: Repository<ModelEntity>) {}

	async getList(filter: GetListModelDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.modelAlias);
		
        // Tái sử dụng alias
		if (filter.keyword?.length) {
			qb.andWhere(`(${OrmAlias.modelAlias}.name ILIKE ANY(:keywords))`, {
				keywords: filter.keyword.map((k) => `%${k}%`),
			});
		}
		
        // Auto gen Paging
		orderAndPaging2({ qb, filter });

		const [items, totalItems] = await qb.getManyAndCount();
		return new PageDto({ items, metadata: { page: filter.page, pageSize: filter.pageSize, totalItems } });
	}
}
```

### 5.2. Mutation Service (Xử lý Insert, Cập nhật, DB Transactions)
- Validate unique (Check xem code/name đã có chưa).
- Sử dụng Database Transaction thông qua `newTransaction(this.repo)`. 
- Cập nhật người thao tác thông qua thuộc tính `creatorId`, `modifierId` kết hợp `queryRunner.manager`.

**Code Pattern chuẩn:**
```typescript
import { Injectable } from '@nestjs/common';
import { newTransaction } from 'src/utils/utils.transaction';

@Injectable()
export class ModelService {
	constructor(
		@InjectRepository(ModelEntity) private repo: Repository<ModelEntity>,
		private queryService: ModelQueryService, // Tiêm Query Service vào
	) {}

	async create({ data, userId }: { data: CreateModelDto; userId: string }) {
		const queryRunner = await newTransaction(this.repo);
		try {
			const manager = queryRunner.manager;
			const logicRepo = manager.getRepository(ModelEntity);

            // Bắt buộc map creatorId hoặc modifierId lấy từ tham số User Auth
			const entity = logicRepo.create({
				...data,
				creatorId: userId,
				modifierId: userId,
			});

			const savedItem = await logicRepo.save(entity);

            // Phát event (Nếu có side effect)
            // this.eventEmitter.emit(AppEvent.DO_SOMETHING);

			await queryRunner.commitTransaction();
			return this.findOne(savedItem.id);
		} catch (e) {
			await queryRunner.rollbackTransaction();
			throw e;
		} finally {
			await queryRunner.release();
		}
	}
}
```

---

## 6. Quy tắc Xử lý Lỗi & Format Response (App Constants)
File quan trọng nhất của mỗi domain nằm ở thư mục `const/`.
Trong toàn bộ logic, **tuyệt đối không** `throw new HttpException(...)` trực tiếp mà phải sử dụng các Class Constant kế thừa từ `ResponseError` & `ResponseSuccess`.

**Code Pattern `const/[model].const.ts` chuẩn:**
```typescript
import { AppResponseSuccess } from 'src/app.const';
import { ResponseError, ResponseSuccess } from 'src/common/dtos/common.response.dto';

// 1. Lớp chứa kết quả trả về
export class ModelSuccess extends AppResponseSuccess {
	static COMMON<T>(data?: T) {
		return new ResponseSuccess({
			data,
            // Hỗ trợ giấu data nhạy cảm
			isRemoveSensitiveFields: true, 
			sensitiveKeys: ['password', 'privateKey'],
		});
	}

	static CREATE(data?: any) {
		return new ResponseSuccess({
			message: 'Create success',
			messageCode: 'model.message.success.create', // I18N messageCode chuẩn
			data,
		});
	}
}

// 2. Lớp ném ra ngoại lệ
export class ModelException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'Item not found',
			messageCode: 'model.message.error.notFound',
		});
	}

	static CODE_EXISTED() {
		return new ResponseError({ // By default là status 400
			message: 'Code already existed',
			messageCode: 'model.message.error.codeExisted',
		});
	}
}
```

---

## 7. Quy tắc Khai báo Controller & Role Guard
- Mỗi Controller bắt buộc phải áp Decorator `@ApiTags` cho Swagger và Role Guard bảo mật, thường là `@SystemAdminOnly()`.
- Xử lý params: `id` (nếu là uuid thì bắt buộc gắn pipe `@Param('id', ParseUUIDPipe)`).
- Inject User ID bằng hàm lấy Request Object `@UserId() userId: string`.

**Code Pattern chuẩn:**
```typescript
import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { UserId } from 'src/common/decorators/req.decorators';
import { ModelSuccess } from './const/model.const';

@ApiTags('Models')
@SystemAdminOnly() // <--- Luôn ghi nhớ Role Guard
@Controller('distribution/models')
export class ModelsController {
	constructor(private readonly svc: ModelService) {}

	@Post()
	@ApiOperation({ summary: 'Create new model' })
	async create(@Body() data: CreateModelDto, @UserId() userId: string) {
		const result = await this.svc.create({ data, userId });
		return ModelSuccess.COMMON(result); // Wrapper thành công
	}

	@Get(':id')
	@ApiParam({ name: 'id', format: 'uuid' })
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		return ModelSuccess.COMMON(await this.svc.findOne(id)); // Wrapper thành công
	}
}
```

--- 

> **🎯 CÚT LÕI (CORE RULE)**: Khi nhận Requirement code mới, không được tự ý sáng tạo kiến trúc. Bạn **BẮT BUỘC** phải mở tài liệu này ra, sao chép (Skeleton/Boilerplate code) các Pattern trên và thay bằng domain tương ứng. Từng Decorator validation, Response wrappers, Naming DB, Transaction manager hay CQRS phải đúng chuẩn 100%.
