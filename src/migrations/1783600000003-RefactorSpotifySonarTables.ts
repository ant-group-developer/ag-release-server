import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorSpotifySonarTables1783600000003
	implements MigrationInterface
{
	name = 'RefactorSpotifySonarTables1783600000003';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Rename spotify_delivery_status → spotify_sonar_delivery
		await queryRunner.query(`
			DO $$
			BEGIN
				IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'spotify_delivery_status') THEN
					ALTER TABLE "spotify_delivery_status" RENAME TO "spotify_sonar_delivery";
					ALTER INDEX IF EXISTS "IDX_spotify_delivery_status_release_id"
						RENAME TO "IDX_spotify_sonar_delivery_release_id";
					ALTER TABLE "spotify_sonar_delivery"
						RENAME CONSTRAINT "PK_spotify_delivery_status_id" TO "PK_spotify_sonar_delivery_id";
					ALTER TABLE "spotify_sonar_delivery"
						RENAME CONSTRAINT "UQ_spotify_delivery_status_release_delivery_feed"
						TO "UQ_spotify_sonar_delivery_release_delivery_feed";
					ALTER TABLE "spotify_sonar_delivery"
						RENAME CONSTRAINT "FK_spotify_delivery_status_release_id"
						TO "FK_spotify_sonar_delivery_release_id";
				END IF;
			END $$;
		`);

		// Drop catalog_deliveries JSONB column từ spotify_catalog nếu còn tồn tại
		await queryRunner.query(`
			ALTER TABLE "spotify_catalog" DROP COLUMN IF EXISTS "catalog_deliveries"
		`);

		// Tạo bảng spotify_catalog_delivery
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "spotify_catalog_delivery" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"catalog_id" uuid NOT NULL,
				"delivery_id" character varying(100) NOT NULL,
				"action" character varying(50),
				"delivered_at" character varying(30),
				"feed_name" character varying(100),
				"product_id" character varying(50),
				"source" character varying(100),
				"feed_gid" character varying(100),
				"delivery_status" character varying(50),
				"delivery_errors" jsonb,
				"delivery_errors_and_types" jsonb,
				"asset_transcoding_statuses" jsonb,
				CONSTRAINT "PK_spotify_catalog_delivery_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_spotify_catalog_delivery_catalog_delivery_id" UNIQUE ("catalog_id", "delivery_id")
			)
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_spotify_catalog_delivery_catalog_id"
			ON "spotify_catalog_delivery" ("catalog_id")
		`);

		await queryRunner.query(`
			ALTER TABLE "spotify_catalog_delivery"
			ADD CONSTRAINT "FK_spotify_catalog_delivery_catalog_id"
			FOREIGN KEY ("catalog_id") REFERENCES "spotify_catalog"("id")
			ON DELETE CASCADE ON UPDATE NO ACTION
		`).catch((err: Error) => {
			if (!err.message.includes('already exists')) throw err;
		});

		await queryRunner.query(`
			COMMENT ON TABLE "spotify_catalog_delivery" IS 'Lịch sử delivery trong catalog Spotify (effectiveData.deliveries từ API 3)'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "spotify_catalog_delivery" DROP CONSTRAINT IF EXISTS "FK_spotify_catalog_delivery_catalog_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_spotify_catalog_delivery_catalog_id"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "spotify_catalog_delivery"`);

		await queryRunner.query(`
			ALTER TABLE "spotify_catalog"
			ADD COLUMN IF NOT EXISTS "catalog_deliveries" jsonb
		`);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'spotify_sonar_delivery') THEN
					ALTER TABLE "spotify_sonar_delivery" RENAME TO "spotify_delivery_status";
				END IF;
			END $$;
		`);
	}
}
