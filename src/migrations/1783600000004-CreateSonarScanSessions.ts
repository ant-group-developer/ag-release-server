import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSonarScanSessions1783600000004 implements MigrationInterface {
	name = 'CreateSonarScanSessions1783600000004';

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      CREATE TABLE "sonar_scan_sessions" (
        "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
        "status"                  VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "total_releases"          INTEGER NOT NULL DEFAULT 0,
        "processed_releases"      INTEGER NOT NULL DEFAULT 0,
        "success_count"           INTEGER NOT NULL DEFAULT 0,
        "failed_count"            INTEGER NOT NULL DEFAULT 0,
        "force"                   BOOLEAN NOT NULL DEFAULT false,
        "trigger_type"            VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
        "schedule_id"             UUID,
        "is_imported_from_report" BOOLEAN,
        "limit_count"             INTEGER,
        "error_message"           TEXT,
        "started_at"              TIMESTAMPTZ,
        "finished_at"             TIMESTAMPTZ,
        "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sonar_scan_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sonar_scan_sessions_schedule"
          FOREIGN KEY ("schedule_id")
          REFERENCES "spotify_sonar_scan_schedules" ("id")
          ON DELETE SET NULL
      )
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_sonar_scan_sessions_status"
        ON "sonar_scan_sessions" ("status")
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_sonar_scan_sessions_created_at"
        ON "sonar_scan_sessions" ("created_at" DESC)
    `);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "sonar_scan_sessions"`);
	}
}
