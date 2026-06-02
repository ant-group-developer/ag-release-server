import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVevoVideoFields1780245000000 implements MigrationInterface {
	name = 'AddVevoVideoFields1780245000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "videos" ADD "keywords" jsonb`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."keywords" IS 'Danh sach tu khoa video phan phoi len YouTube/Vevo'`,
		);
		await queryRunner.query(
			`ALTER TABLE "videos" ADD "is_unlisted" boolean NOT NULL DEFAULT false`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."is_unlisted" IS 'Dang video o trang thai khong cong khai tren YouTube/Vevo'`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "type" SET DEFAULT 'audio'`,
		);
		await queryRunner.query(
			`UPDATE "releases" SET "type" = lower("type") WHERE "type" IN ('Audio', 'Video')`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`UPDATE "releases" SET "type" = initcap("type") WHERE "type" IN ('audio', 'video')`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "type" SET DEFAULT 'Audio'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."is_unlisted" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "videos" DROP COLUMN "is_unlisted"`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."keywords" IS NULL`,
		);
		await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "keywords"`);
	}
}
