import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMetadataScanSchedules1781230045716
	implements MigrationInterface
{
	name = 'CreateMetadataScanSchedules1781230045716';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "metadata_scan_schedules" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"name" character varying(120) NOT NULL,
				"enabled" boolean NOT NULL DEFAULT true,
				"cron_expression" character varying(100) NOT NULL,
				"timezone" character varying(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
				"is_imported_from_report" boolean NOT NULL,
				"limit_count" integer DEFAULT 500,
				"force" boolean NOT NULL DEFAULT false,
				"is_deleted" boolean NOT NULL DEFAULT false,
				"last_run_at" TIMESTAMP WITH TIME ZONE,
				"last_scan_id" uuid,
				"last_skipped_at" TIMESTAMP WITH TIME ZONE,
				"last_skip_reason" text,
				"last_error" text,
				CONSTRAINT "PK_metadata_scan_schedules_id" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_metadata_scan_schedules_is_deleted"
			ON "metadata_scan_schedules" ("is_deleted")
		`);

		await queryRunner.query(`
			ALTER TABLE "metadata_scan_sessions"
			ADD COLUMN IF NOT EXISTS "trigger_type" character varying(20) NOT NULL DEFAULT 'MANUAL'
		`);
		await queryRunner.query(`
			ALTER TABLE "metadata_scan_sessions"
			ADD COLUMN IF NOT EXISTS "schedule_id" uuid
		`);
		await queryRunner.query(`
			ALTER TABLE "metadata_scan_sessions"
			ADD COLUMN IF NOT EXISTS "is_imported_from_report" boolean
		`);
		await queryRunner.query(`
			ALTER TABLE "metadata_scan_sessions"
			ADD CONSTRAINT "FK_metadata_scan_sessions_schedule_id"
			FOREIGN KEY ("schedule_id") REFERENCES "metadata_scan_schedules"("id")
			ON DELETE SET NULL ON UPDATE NO ACTION
		`).catch((err: Error) => {
			if (!err.message.includes('already exists')) throw err;
		});

		await queryRunner.query(
			`COMMENT ON TABLE "metadata_scan_schedules" IS 'Bảng cấu hình lịch tự động quét enrich metadata'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "metadata_scan_sessions" DROP CONSTRAINT IF EXISTS "FK_metadata_scan_sessions_schedule_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "metadata_scan_sessions" DROP COLUMN IF EXISTS "is_imported_from_report"`,
		);
		await queryRunner.query(
			`ALTER TABLE "metadata_scan_sessions" DROP COLUMN IF EXISTS "schedule_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "metadata_scan_sessions" DROP COLUMN IF EXISTS "trigger_type"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_metadata_scan_schedules_is_deleted"`,
		);
		await queryRunner.query(`DROP TABLE IF EXISTS "metadata_scan_schedules"`);
	}
}
