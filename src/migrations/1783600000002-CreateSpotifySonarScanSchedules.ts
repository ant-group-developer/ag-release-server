import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSpotifySonarScanSchedules1783600000002
	implements MigrationInterface
{
	name = 'CreateSpotifySonarScanSchedules1783600000002';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "spotify_sonar_scan_schedules" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"name" character varying(120) NOT NULL,
				"enabled" boolean NOT NULL DEFAULT true,
				"cron_expression" character varying(100) NOT NULL,
				"timezone" character varying(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
				"is_imported_from_report" boolean DEFAULT NULL,
				"limit_count" integer DEFAULT 500,
				"force" boolean NOT NULL DEFAULT false,
				"is_deleted" boolean NOT NULL DEFAULT false,
				"last_run_at" TIMESTAMP WITH TIME ZONE,
				"last_scan_id" uuid,
				"last_skipped_at" TIMESTAMP WITH TIME ZONE,
				"last_skip_reason" text,
				"last_error" text,
				CONSTRAINT "PK_spotify_sonar_scan_schedules_id" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_spotify_sonar_scan_schedules_is_deleted"
			ON "spotify_sonar_scan_schedules" ("is_deleted")
		`);

		await queryRunner.query(`
			COMMENT ON TABLE "spotify_sonar_scan_schedules" IS 'Cấu hình lịch tự động lấy dữ liệu Spotify Sonar delivery + catalog'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_spotify_sonar_scan_schedules_is_deleted"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "spotify_sonar_scan_schedules"`);
	}
}
