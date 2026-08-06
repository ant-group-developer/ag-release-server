import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateYoutubeChannelSyncRunSummaries1785700000001
	implements MigrationInterface
{
	name = 'CreateYoutubeChannelSyncRunSummaries1785700000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "youtube_channel_sync_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actor_id" uuid NOT NULL,
        "force" boolean NOT NULL DEFAULT false,
        "total_channels" integer NOT NULL DEFAULT 0,
        "processed_channels" integer NOT NULL DEFAULT 0,
        "updated_channels" integer NOT NULL DEFAULT 0,
        "updated_fields" integer NOT NULL DEFAULT 0,
        "no_change_channels" integer NOT NULL DEFAULT 0,
        "missing_youtube_channel_id" integer NOT NULL DEFAULT 0,
        "not_found_on_youtube" integer NOT NULL DEFAULT 0,
        "failed_channels" integer NOT NULL DEFAULT 0,
        "errors" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_youtube_channel_sync_runs_id" PRIMARY KEY ("id")
      )
    `);
		await queryRunner.query(`
      ALTER TABLE "youtube_channel_sync_logs"
      ADD COLUMN IF NOT EXISTS "run_id" uuid
    `);
		await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_youtube_channel_sync_runs_created_at"
      ON "youtube_channel_sync_runs" ("created_at")
    `);
		await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_youtube_channel_sync_logs_run_created_at"
      ON "youtube_channel_sync_logs" ("run_id", "created_at")
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_youtube_channel_sync_logs_run_created_at"`,
		);
		await queryRunner.query(
			`ALTER TABLE "youtube_channel_sync_logs" DROP COLUMN IF EXISTS "run_id"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "youtube_channel_sync_runs"`,
		);
	}
}
