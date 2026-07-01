import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateYoutubeApiKeys1782722273600 implements MigrationInterface {
	name = 'CreateYoutubeApiKeys1782722273600';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "youtube_api_keys" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"alias" character varying(100) NOT NULL,
				"key_encrypted" text NOT NULL,
				"key_hint" character varying(20) NOT NULL,
				"status" character varying(20) NOT NULL DEFAULT 'active',
				"daily_quota_limit" integer NOT NULL DEFAULT 10000,
				"units_consumed_today" integer NOT NULL DEFAULT 0,
				"last_reset_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"consecutive_error_count" integer NOT NULL DEFAULT 0,
				"last_used_at" TIMESTAMP WITH TIME ZONE,
				"last_error" text,
				CONSTRAINT "PK_youtube_api_keys_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_youtube_api_keys_alias" UNIQUE ("alias")
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_youtube_api_keys_status_used" ON "youtube_api_keys" ("status", "units_consumed_today")`,
		);

		await queryRunner.query(
			`COMMENT ON TABLE "youtube_api_keys" IS 'Danh sach Google/YouTube Data API keys de rotate tranh quota limit'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_api_keys"."alias" IS 'Friendly name cho admin UI'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_api_keys"."key_encrypted" IS 'API key duoc encrypt AES-256-GCM: iv:authTag:ciphertext (base64)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_api_keys"."key_hint" IS '4 ky tu cuoi plaintext key de hien thi UI (AIza...tryHY)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_api_keys"."status" IS 'active | disabled | quota_exceeded | invalid'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_api_keys"."daily_quota_limit" IS 'Quota limit daily cua key (mac dinh 10000 units/ngay)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_api_keys"."units_consumed_today" IS 'So units da tieu thu trong ngay hien tai'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_api_keys"."last_reset_at" IS 'Thoi diem reset counter gan nhat'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_youtube_api_keys_status_used"`,
		);
		await queryRunner.query(`DROP TABLE "youtube_api_keys"`);
	}
}
