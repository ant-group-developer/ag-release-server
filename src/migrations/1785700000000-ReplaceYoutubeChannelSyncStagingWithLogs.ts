import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceYoutubeChannelSyncStagingWithLogs1785700000000
	implements MigrationInterface
{
	name = 'ReplaceYoutubeChannelSyncStagingWithLogs1785700000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// These staging tables belonged to the previous approve workflow. IF EXISTS
		// keeps this migration safe for environments where it was never applied.
		await queryRunner.query(`DROP TABLE IF EXISTS "youtube_channel_sync_items"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "youtube_channel_sync_runs"`);

		await queryRunner.query(`
			CREATE TABLE "youtube_channel_sync_logs" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"channel_id" uuid,
				"youtube_channel_id" character varying(100) NOT NULL,
				"actor_id" uuid NOT NULL,
				"force" boolean NOT NULL DEFAULT false,
				"field_name" character varying(100) NOT NULL,
				"previous_value" text,
				"next_value" text,
				CONSTRAINT "PK_youtube_channel_sync_logs_id" PRIMARY KEY ("id"),
				CONSTRAINT "FK_youtube_channel_sync_logs_channel" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_youtube_channel_sync_logs_channel_created_at" ON "youtube_channel_sync_logs" ("channel_id", "created_at")`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "youtube_channel_sync_logs"`);
	}
}
