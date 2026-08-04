import { nanoid } from 'nanoid';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoLabelId1785500000000 implements MigrationInterface {
	name = 'AddVideoLabelId1785500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// BƯỚC 1: Thêm cột label_id vào bảng videos (cho phép NULL để tránh lock bảng)
		await queryRunner.query(
			`ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "label_id" character varying(50)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."label_id" IS 'ID nhan dia tro sang bang labels'`,
		);

		// BƯỚC 2: Thêm khóa ngoại Foreign Key liên kết sang bảng labels (ON DELETE RESTRICT an toàn)
		await queryRunner.query(
			`ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_label_id" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
		);

		// BƯỚC 3: Tra cứu các label cũ chưa tồn tại trong danh mục labels của Tenant
		// - Gom nhóm các tên biến thể (ví dụ "Zic Zic", "ziczic") về chung 1 nhóm đại diện.
		// - Kiểm tra 2 lớp (Tên và Mã code) để đảm bảo 100% không dính lỗi trùng Unique Constraint.
		const missingLabels = await queryRunner.query(`
			SELECT 
				MIN(TRIM(v."label")) as name,
				UPPER(REGEXP_REPLACE(MIN(TRIM(v."label")), '[^a-zA-Z0-9]', '_', 'g')) as code,
				r."tenant_id"
			FROM "videos" v
			JOIN "releases" r ON v."release_id" = r."id"
			WHERE v."label" IS NOT NULL 
			  AND TRIM(v."label") <> ''
			  AND v."label_id" IS NULL
			  AND NOT EXISTS (
				  SELECT 1 FROM "labels" l 
				  WHERE l."tenant_id" = r."tenant_id" 
					AND (
						UPPER(REGEXP_REPLACE(TRIM(l."name"), '[^a-zA-Z0-9]', '', 'g')) = UPPER(REGEXP_REPLACE(TRIM(v."label"), '[^a-zA-Z0-9]', '', 'g'))
						OR LOWER(TRIM(l."code")) = LOWER(TRIM(UPPER(REGEXP_REPLACE(TRIM(v."label"), '[^a-zA-Z0-9]', '_', 'g'))))
					)
			  )
			GROUP BY UPPER(REGEXP_REPLACE(TRIM(v."label"), '[^a-zA-Z0-9]', '', 'g')), r."tenant_id";
		`);

		// BƯỚC 3.1: Khởi tạo các Label mới bằng mã nanoid(10) chuẩn 100% kiến trúc NestJS Entity
		for (const item of missingLabels) {
			const labelId = nanoid(10); // Sinh ID 10 ký tự chuẩn BaseCustomIDEntity
			await queryRunner.query(
				`INSERT INTO "labels" ("id", "name", "code", "tenant_id", "created_at", "updated_at")
				 VALUES ($1, $2, $3, $4, NOW(), NOW())
				 ON CONFLICT ("name", "tenant_id") DO NOTHING;`,
				[labelId, item.name, item.code, item.tenant_id],
			);
		}

		// BƯỚC 4: Backfill ánh xạ label_id cho toàn bộ các Video cũ thuộc về cùng Tenant
		await queryRunner.query(`
			UPDATE "videos" v
			SET "label_id" = l."id"
			FROM "releases" r
			JOIN "labels" l ON l."tenant_id" = r."tenant_id"
			WHERE v."release_id" = r."id"
			  AND UPPER(REGEXP_REPLACE(TRIM(v."label"), '[^a-zA-Z0-9]', '', 'g')) = UPPER(REGEXP_REPLACE(TRIM(l."name"), '[^a-zA-Z0-9]', '', 'g'))
			  AND v."label_id" IS NULL;
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Rollback khóa ngoại và cột label_id khi cần revert
		await queryRunner.query(
			`ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "FK_videos_label_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "videos" DROP COLUMN IF EXISTS "label_id"`,
		);
	}
}
