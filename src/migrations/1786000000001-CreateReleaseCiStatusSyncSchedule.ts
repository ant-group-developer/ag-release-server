import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseCiStatusSyncSchedule1786000000001
	implements MigrationInterface
{
	name = 'CreateReleaseCiStatusSyncSchedule1786000000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "release_ci_status_sync_schedules" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"name" character varying(120) NOT NULL,
				"sync_status_enabled" boolean NOT NULL DEFAULT false,
				"cron_expression" character varying(100) NOT NULL DEFAULT '0 6 * * *',
				"timezone" character varying(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
				"release_statuses" character varying[] NOT NULL DEFAULT ARRAY['submitted', 'processing']::varchar[],
				"batch_size" integer NOT NULL DEFAULT 100,
				"concurrency" integer NOT NULL DEFAULT 3,
				"is_running" boolean NOT NULL DEFAULT false,
				"running_since" TIMESTAMP WITH TIME ZONE,
				"running_by" uuid,
				"last_run_at" TIMESTAMP WITH TIME ZONE,
				"last_finished_at" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_release_ci_status_sync_schedules_id" PRIMARY KEY ("id"),
				CONSTRAINT "CHK_release_ci_status_sync_batch_size" CHECK ("batch_size" BETWEEN 1 AND 500),
				CONSTRAINT "CHK_release_ci_status_sync_concurrency" CHECK ("concurrency" BETWEEN 1 AND 10)
			)
		`);

		await queryRunner.query(`
			COMMENT ON TABLE "release_ci_status_sync_schedules"
			IS 'Cấu hình lịch đồng bộ trạng thái release từ CI'
		`);

		await queryRunner.query(`
			INSERT INTO "release_ci_status_sync_schedules" (
				"name",
				"sync_status_enabled",
				"cron_expression",
				"timezone",
				"release_statuses",
				"batch_size",
				"concurrency"
			)
			SELECT
				'Daily CI release status sync',
				false,
				'0 6 * * *',
				'Asia/Ho_Chi_Minh',
				ARRAY['submitted', 'processing']::varchar[],
				100,
				3
			WHERE NOT EXISTS (
				SELECT 1 FROM "release_ci_status_sync_schedules"
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP TABLE IF EXISTS "release_ci_status_sync_schedules"`,
		);
	}
}
