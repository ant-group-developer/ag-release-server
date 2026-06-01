import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateVideoAiContent1780249000000 implements MigrationInterface {
	name = 'UpdateVideoAiContent1780249000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "videos"
			RENAME COLUMN "is_ai" TO "ai_content"
		`);

		await queryRunner.query(`
			ALTER TABLE "videos"
			ALTER COLUMN "ai_content" DROP DEFAULT
		`);

		await queryRunner.query(`
			ALTER TABLE "videos"
			ALTER COLUMN "ai_content" TYPE varchar(20)
			USING CASE
				WHEN "ai_content" = true THEN 'All'
				ELSE 'None'
			END
		`);

		await queryRunner.query(`
			ALTER TABLE "videos"
			ALTER COLUMN "ai_content" SET DEFAULT 'Undetermined'
		`);

		await queryRunner.query(`
			COMMENT ON COLUMN "videos"."ai_content"
			IS 'Trang thai noi dung AI cua video theo VEVO: All, Partly, None, Undetermined'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			COMMENT ON COLUMN "videos"."ai_content" IS NULL
		`);

		await queryRunner.query(`
			ALTER TABLE "videos"
			ALTER COLUMN "ai_content" DROP DEFAULT
		`);

		await queryRunner.query(`
			ALTER TABLE "videos"
			ALTER COLUMN "ai_content" TYPE boolean
			USING CASE
				WHEN "ai_content" IN ('All', 'Partly') THEN true
				ELSE false
			END
		`);

		await queryRunner.query(`
			ALTER TABLE "videos"
			ALTER COLUMN "ai_content" SET DEFAULT false
		`);

		await queryRunner.query(`
			ALTER TABLE "videos"
			RENAME COLUMN "ai_content" TO "is_ai"
		`);

		await queryRunner.query(`
			COMMENT ON COLUMN "videos"."is_ai"
			IS 'Xac dinh video co su dung cong nghe hoac noi dung do AI tao ra hay khong'
		`);
	}
}
