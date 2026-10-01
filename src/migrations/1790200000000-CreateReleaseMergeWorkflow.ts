import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseMergeWorkflow1790200000000
	implements MigrationInterface
{
	name = 'CreateReleaseMergeWorkflow1790200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DO $$ BEGIN
				ALTER TYPE "asset_import_items_action_enum" ADD VALUE IF NOT EXISTS 'MERGE_REQUIRED';
			EXCEPTION WHEN duplicate_object THEN NULL; END $$
		`);

		await queryRunner.query(`
			CREATE TYPE "release_merge_runs_trigger_enum" AS ENUM ('FULL_SCAN', 'ASSET_IMPORT')
		`);
		await queryRunner.query(`
			CREATE TYPE "release_merge_runs_status_enum" AS ENUM (
				'SCANNING', 'READY', 'APPLYING', 'PARTIALLY_APPLIED', 'APPLIED', 'FAILED'
			)
		`);
		await queryRunner.query(`
			CREATE TYPE "release_merge_items_classification_enum" AS ENUM ('AUTO_SAFE', 'MANUAL_REVIEW')
		`);
		await queryRunner.query(`
			CREATE TYPE "release_merge_items_status_enum" AS ENUM (
				'PENDING', 'APPLYING', 'APPLIED', 'MANUAL_REVIEW', 'STALE', 'FAILED'
			)
		`);

		await queryRunner.query(`
			CREATE TABLE "release_merge_runs" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" timestamptz NOT NULL DEFAULT now(),
				"updated_at" timestamptz NOT NULL DEFAULT now(),
				"trigger" "release_merge_runs_trigger_enum" NOT NULL,
				"status" "release_merge_runs_status_enum" NOT NULL,
				"requested_by" uuid,
				"total_candidates" integer NOT NULL DEFAULT 0,
				"auto_safe_candidates" integer NOT NULL DEFAULT 0,
				"manual_candidates" integer NOT NULL DEFAULT 0,
				"applied_candidates" integer NOT NULL DEFAULT 0,
				"failed_candidates" integer NOT NULL DEFAULT 0,
				"error_message" text,
				"completed_at" timestamptz,
				CONSTRAINT "PK_release_merge_runs" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_release_merge_runs_status_created"
			ON "release_merge_runs" ("status", "created_at" DESC)
		`);

		await queryRunner.query(`
			CREATE TABLE "release_merge_items" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" timestamptz NOT NULL DEFAULT now(),
				"updated_at" timestamptz NOT NULL DEFAULT now(),
				"run_id" uuid NOT NULL,
				"source_release_id" uuid NOT NULL,
				"target_release_id" uuid,
				"candidate_target_release_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"classification" "release_merge_items_classification_enum" NOT NULL,
				"status" "release_merge_items_status_enum" NOT NULL,
				"reason_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"shared_isrcs" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"source_only_isrcs" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"target_only_isrcs" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"source_track_count" integer NOT NULL DEFAULT 0,
				"target_track_count" integer NOT NULL DEFAULT 0,
				"upc_equivalent" boolean NOT NULL DEFAULT false,
				"snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"applied_by" uuid,
				"applied_at" timestamptz,
				"error_message" text,
				CONSTRAINT "PK_release_merge_items" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_release_merge_items_run_source" UNIQUE ("run_id", "source_release_id"),
				CONSTRAINT "FK_release_merge_items_run" FOREIGN KEY ("run_id")
					REFERENCES "release_merge_runs"("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_release_merge_items_run_class_status"
			ON "release_merge_items" ("run_id", "classification", "status")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_release_merge_items_target" ON "release_merge_items" ("target_release_id")
		`);

		await queryRunner.query(`
			CREATE TABLE "release_merge_aliases" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" timestamptz NOT NULL DEFAULT now(),
				"updated_at" timestamptz NOT NULL DEFAULT now(),
				"source_release_id" uuid NOT NULL,
				"target_release_id" uuid NOT NULL,
				"merge_item_id" uuid,
				"source_upc" varchar(20),
				"source_title" varchar(150),
				"source_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"merged_at" timestamptz NOT NULL,
				CONSTRAINT "PK_release_merge_aliases" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_release_merge_aliases_source" UNIQUE ("source_release_id")
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_release_merge_aliases_target" ON "release_merge_aliases" ("target_release_id")
		`);

		await queryRunner.query(`
			CREATE TABLE "track_merge_aliases" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" timestamptz NOT NULL DEFAULT now(),
				"updated_at" timestamptz NOT NULL DEFAULT now(),
				"source_track_id" varchar(10) NOT NULL,
				"target_track_id" varchar(10) NOT NULL,
				"isrc" varchar(20),
				"source_release_id" uuid NOT NULL,
				"target_release_id" uuid NOT NULL,
				"merge_item_id" uuid,
				CONSTRAINT "PK_track_merge_aliases" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_track_merge_aliases_source" UNIQUE ("source_track_id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_track_merge_aliases_target" ON "track_merge_aliases" ("target_track_id")`);
		await queryRunner.query(`CREATE INDEX "IDX_track_merge_aliases_isrc" ON "track_merge_aliases" ("isrc")`);

		await queryRunner.query(`
			CREATE TABLE "release_stat_identities" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" timestamptz NOT NULL DEFAULT now(),
				"updated_at" timestamptz NOT NULL DEFAULT now(),
				"stat_key" varchar(32) NOT NULL,
				"key_type" varchar(10) NOT NULL,
				"release_id" uuid NOT NULL,
				"track_id" varchar(10),
				"source_release_id" uuid,
				"merge_item_id" uuid,
				"active" boolean NOT NULL DEFAULT true,
				CONSTRAINT "PK_release_stat_identities" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_release_stat_identities_active_key"
			ON "release_stat_identities" ("stat_key") WHERE "active" = true
		`);
		await queryRunner.query(`CREATE INDEX "IDX_release_stat_identities_release" ON "release_stat_identities" ("release_id")`);

		await queryRunner.query(`
			ALTER TABLE "asset_import_items"
				ADD COLUMN "duplicate_classification" varchar(40),
				ADD COLUMN "canonical_release_id" uuid,
				ADD COLUMN "canonical_track_id" varchar(10),
				ADD COLUMN "duplicate_source_release_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
				ADD COLUMN "requires_merge" boolean NOT NULL DEFAULT false,
				ADD COLUMN "merge_item_id" uuid,
				ADD COLUMN "rescanned_at" timestamptz
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_tracks_normalized_isrc_release"
			ON "tracks" ((upper(regexp_replace(btrim("isrc"), '[-[:space:]]', '', 'g'))), "release_id")
			WHERE "isrc" IS NOT NULL AND btrim("isrc") <> '' AND "isrc" NOT LIKE 'UPC-%'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tracks_normalized_isrc_release"`);
		await queryRunner.query(`
			ALTER TABLE "asset_import_items"
				DROP COLUMN IF EXISTS "rescanned_at",
				DROP COLUMN IF EXISTS "merge_item_id",
				DROP COLUMN IF EXISTS "requires_merge",
				DROP COLUMN IF EXISTS "duplicate_source_release_ids",
				DROP COLUMN IF EXISTS "canonical_track_id",
				DROP COLUMN IF EXISTS "canonical_release_id",
				DROP COLUMN IF EXISTS "duplicate_classification"
		`);
		await queryRunner.query(`DROP TABLE IF EXISTS "release_stat_identities"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "track_merge_aliases"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "release_merge_aliases"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "release_merge_items"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "release_merge_runs"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "release_merge_items_status_enum"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "release_merge_items_classification_enum"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "release_merge_runs_status_enum"`);
		await queryRunner.query(`DROP TYPE IF EXISTS "release_merge_runs_trigger_enum"`);
		// PostgreSQL cannot remove one enum value safely. MERGE_REQUIRED is intentionally retained.
	}
}

