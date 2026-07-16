import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSpotifyDeliveryStatusAndCatalog1783600000001
	implements MigrationInterface
{
	name = 'CreateSpotifyDeliveryStatusAndCatalog1783600000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "spotify_delivery_status" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_id" uuid NOT NULL,
				"spotify_id" character varying(50),
				"feed_gid" character varying(100) NOT NULL,
				"delivery_name" character varying(100) NOT NULL,
				"product_id" character varying(50) NOT NULL,
				"status" character varying(50) NOT NULL,
				"created_at_spotify" TIMESTAMP WITH TIME ZONE,
				"updated_at_spotify" TIMESTAMP WITH TIME ZONE,
				"licensor_uuid" character varying(50),
				"licensor_name" character varying(255),
				"feed_name" character varying(100),
				"album_uri" character varying(255),
				"artist_names" jsonb,
				"album_name" character varying(255),
				"cover_art_sha1" jsonb,
				"earliest_start_date" TIMESTAMP WITH TIME ZONE,
				"validation_errors" jsonb,
				"is_provider_test" boolean NOT NULL DEFAULT false,
				"warning_status" character varying(50),
				"warning_count" integer NOT NULL DEFAULT 0,
				CONSTRAINT "PK_spotify_delivery_status_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_spotify_delivery_status_release_delivery_feed" UNIQUE ("release_id", "delivery_name", "feed_gid")
			)
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_spotify_delivery_status_release_id"
			ON "spotify_delivery_status" ("release_id")
		`);

		await queryRunner.query(`
			ALTER TABLE "spotify_delivery_status"
			ADD CONSTRAINT "FK_spotify_delivery_status_release_id"
			FOREIGN KEY ("release_id") REFERENCES "releases"("id")
			ON DELETE CASCADE ON UPDATE NO ACTION
		`).catch((err: Error) => {
			if (!err.message.includes('already exists')) throw err;
		});

		await queryRunner.query(`
			COMMENT ON TABLE "spotify_delivery_status" IS 'Lịch sử delivery của release lên Spotify Sonar (API 1 + API 2)'
		`);

		// spotify_catalog
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "spotify_catalog" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_id" uuid NOT NULL,
				"album_uri" character varying(255),
				"album_url" character varying(512),
				"artists" jsonb,
				"catalog_deliveries" jsonb,
				"synced_at" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_spotify_catalog_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_spotify_catalog_release_id" UNIQUE ("release_id")
			)
		`);

		await queryRunner.query(`
			ALTER TABLE "spotify_catalog"
			ADD CONSTRAINT "FK_spotify_catalog_release_id"
			FOREIGN KEY ("release_id") REFERENCES "releases"("id")
			ON DELETE CASCADE ON UPDATE NO ACTION
		`).catch((err: Error) => {
			if (!err.message.includes('already exists')) throw err;
		});

		await queryRunner.query(`
			COMMENT ON TABLE "spotify_catalog" IS 'Dữ liệu catalog từ Spotify Atlas API (effectiveData)'
		`);

		// spotify_catalog_availability
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "spotify_catalog_availability" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"catalog_id" uuid NOT NULL,
				"country_code" character(2) NOT NULL,
				"delivered_start" character varying(30),
				"delivered_end" character varying(30),
				"effective_start" character varying(30),
				"effective_end" character varying(30),
				"status" character varying(50),
				CONSTRAINT "PK_spotify_catalog_availability_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_spotify_catalog_availability_catalog_country" UNIQUE ("catalog_id", "country_code")
			)
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_spotify_catalog_availability_catalog_id"
			ON "spotify_catalog_availability" ("catalog_id")
		`);

		await queryRunner.query(`
			ALTER TABLE "spotify_catalog_availability"
			ADD CONSTRAINT "FK_spotify_catalog_availability_catalog_id"
			FOREIGN KEY ("catalog_id") REFERENCES "spotify_catalog"("id")
			ON DELETE CASCADE ON UPDATE NO ACTION
		`).catch((err: Error) => {
			if (!err.message.includes('already exists')) throw err;
		});

		await queryRunner.query(`
			COMMENT ON TABLE "spotify_catalog_availability" IS 'Availability theo quốc gia từ Spotify Atlas (1 row = 1 quốc gia)'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "spotify_catalog_availability" DROP CONSTRAINT IF EXISTS "FK_spotify_catalog_availability_catalog_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_spotify_catalog_availability_catalog_id"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "spotify_catalog_availability"`);

		await queryRunner.query(`ALTER TABLE "spotify_catalog" DROP CONSTRAINT IF EXISTS "FK_spotify_catalog_release_id"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "spotify_catalog"`);

		await queryRunner.query(`ALTER TABLE "spotify_delivery_status" DROP CONSTRAINT IF EXISTS "FK_spotify_delivery_status_release_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_spotify_delivery_status_release_id"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "spotify_delivery_status"`);
	}
}
