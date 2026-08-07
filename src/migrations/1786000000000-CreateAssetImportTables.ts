import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssetImportTables1786000000000 implements MigrationInterface {
	name = 'CreateAssetImportTables1786000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// ── Enum types ────────────────────────────────────────────────
		await queryRunner.query(`
			DO $$ BEGIN
				CREATE TYPE "asset_import_batches_status_enum" AS ENUM (
					'SCANNING','SCANNED','APPLYING','APPLIED','PARTIALLY_APPLIED','FAILED','CANCELLED'
				);
			EXCEPTION WHEN duplicate_object THEN NULL; END $$;
		`);
		await queryRunner.query(`
			DO $$ BEGIN
				CREATE TYPE "asset_import_items_match_type_enum" AS ENUM ('ISRC','UPC','NONE');
			EXCEPTION WHEN duplicate_object THEN NULL; END $$;
		`);
		await queryRunner.query(`
			DO $$ BEGIN
				CREATE TYPE "asset_import_items_action_enum" AS ENUM (
					'UPDATE','CREATE','NO_CHANGE','INVALID','CONFLICT'
				);
			EXCEPTION WHEN duplicate_object THEN NULL; END $$;
		`);
		await queryRunner.query(`
			DO $$ BEGIN
				CREATE TYPE "asset_import_items_status_enum" AS ENUM (
					'PENDING','APPLIED','SKIPPED','FAILED'
				);
			EXCEPTION WHEN duplicate_object THEN NULL; END $$;
		`);

		// ── asset_import_batches ──────────────────────────────────────
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "asset_import_batches" (
				"id"                uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"file_name"         character varying(500) NOT NULL,
				"file_hash"         character varying(64),
				"target_tenant_id"  uuid NOT NULL,
				"target_label_id"   character varying(10),
				"options"           jsonb NOT NULL,
				"status"            "asset_import_batches_status_enum" NOT NULL DEFAULT 'SCANNING',
				"total_rows"        integer NOT NULL DEFAULT 0,
				"matched_rows"      integer NOT NULL DEFAULT 0,
				"new_rows"          integer NOT NULL DEFAULT 0,
				"invalid_rows"      integer NOT NULL DEFAULT 0,
				"applied_rows"      integer NOT NULL DEFAULT 0,
				"failed_rows"       integer NOT NULL DEFAULT 0,
				"scan_job_id"       character varying(64),
				"apply_job_id"      character varying(64),
				"error_message"     text,
				"requested_by"      uuid NOT NULL,
				"applied_by"        uuid,
				"scanned_at"        TIMESTAMP WITH TIME ZONE,
				"applied_at"        TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_asset_import_batches" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			COMMENT ON TABLE "asset_import_batches" IS
			'Mỗi bản ghi là một lần upload file assets + quét đối chiếu với hệ thống'
		`);

		// ON DELETE RESTRICT: giữ lịch sử import, không cho xoá tenant/label còn batch tham chiếu.
		await queryRunner.query(`
			ALTER TABLE "asset_import_batches"
			ADD CONSTRAINT "FK_asset_import_batches_target_tenant_id"
			FOREIGN KEY ("target_tenant_id") REFERENCES "tenants"("id")
			ON DELETE RESTRICT ON UPDATE CASCADE
		`);
		await queryRunner.query(`
			ALTER TABLE "asset_import_batches"
			ADD CONSTRAINT "FK_asset_import_batches_target_label_id"
			FOREIGN KEY ("target_label_id") REFERENCES "labels"("id")
			ON DELETE RESTRICT ON UPDATE CASCADE
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_asset_import_batches_tenant_created"
			ON "asset_import_batches" ("target_tenant_id", "created_at" DESC)
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_asset_import_batches_status"
			ON "asset_import_batches" ("status")
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_asset_import_batches_file_hash"
			ON "asset_import_batches" ("file_hash")
		`);

		// ── asset_import_items ────────────────────────────────────────
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "asset_import_items" (
				"id"                  uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"batch_id"            uuid NOT NULL,
				"row_number"          integer NOT NULL,
				"raw_data"            jsonb NOT NULL,
				"isrc"                character varying(20),
				"upc"                 character varying(20),
				"track_name"          character varying(500),
				"album_name"          character varying(500),
				"label_name"          character varying(255),
				"match_type"          "asset_import_items_match_type_enum" NOT NULL DEFAULT 'NONE',
				"action"              "asset_import_items_action_enum" NOT NULL DEFAULT 'NO_CHANGE',
				"matched_release_id"  uuid,
				"matched_track_id"    character varying(10),
				"current_tenant_id"   uuid,
				"current_label_id"    character varying(10),
				"changes"             jsonb NOT NULL DEFAULT '[]'::jsonb,
				"status"              "asset_import_items_status_enum" NOT NULL DEFAULT 'PENDING',
				"error_message"       text,
				"applied_at"          TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_asset_import_items" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			COMMENT ON TABLE "asset_import_items" IS
			'Mỗi bản ghi là một dòng trong file assets đã được đối chiếu'
		`);

		await queryRunner.query(`
			ALTER TABLE "asset_import_items"
			ADD CONSTRAINT "FK_asset_import_items_batch_id"
			FOREIGN KEY ("batch_id") REFERENCES "asset_import_batches"("id")
			ON DELETE CASCADE ON UPDATE CASCADE
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_asset_import_items_batch_status"
			ON "asset_import_items" ("batch_id", "status")
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_asset_import_items_batch_action"
			ON "asset_import_items" ("batch_id", "action")
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_asset_import_items_isrc"
			ON "asset_import_items" ("isrc")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "asset_import_items"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "asset_import_batches"`);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "asset_import_items_status_enum"`,
		);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "asset_import_items_action_enum"`,
		);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "asset_import_items_match_type_enum"`,
		);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "asset_import_batches_status_enum"`,
		);
	}
}
