import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateYoutubeChannelSyncStaging1785600000000
	implements MigrationInterface
{
	name = 'CreateYoutubeChannelSyncStaging1785600000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "youtube_channel_sync_runs" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"status" character varying(20) NOT NULL DEFAULT 'PENDING',
				"requested_by" uuid NOT NULL,
				"total_channels" integer NOT NULL DEFAULT 0,
				"processed_channels" integer NOT NULL DEFAULT 0,
				"change_detected_count" integer NOT NULL DEFAULT 0,
				"no_change_count" integer NOT NULL DEFAULT 0,
				"missing_youtube_channel_id_count" integer NOT NULL DEFAULT 0,
				"not_found_count" integer NOT NULL DEFAULT 0,
				"failed_count" integer NOT NULL DEFAULT 0,
				"started_at" TIMESTAMP WITH TIME ZONE,
				"completed_at" TIMESTAMP WITH TIME ZONE,
				"error_summary" text,
				CONSTRAINT "PK_youtube_channel_sync_runs_id" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_youtube_channel_sync_runs_status_created_at" ON "youtube_channel_sync_runs" ("status", "created_at")`);
		await queryRunner.query(`
			CREATE TABLE "youtube_channel_sync_items" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"sync_run_id" uuid NOT NULL,
				"channel_id" uuid,
				"youtube_channel_id" character varying(100),
				"current_name" character varying(200) NOT NULL,
				"proposed_name" character varying(200),
				"current_thumb_url" character varying(500),
				"proposed_thumb_url" character varying(500),
				"changed_fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"sync_result" character varying(40) NOT NULL,
				"review_status" character varying(20),
				"channel_updated_at_snapshot" TIMESTAMP WITH TIME ZONE NOT NULL,
				"reviewed_by" uuid,
				"reviewed_at" TIMESTAMP WITH TIME ZONE,
				"applied_at" TIMESTAMP WITH TIME ZONE,
				"note" text,
				"error_message" text,
				CONSTRAINT "PK_youtube_channel_sync_items_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_youtube_channel_sync_items_run_channel" UNIQUE ("sync_run_id", "channel_id"),
				CONSTRAINT "FK_youtube_channel_sync_items_run" FOREIGN KEY ("sync_run_id") REFERENCES "youtube_channel_sync_runs"("id") ON DELETE CASCADE,
				CONSTRAINT "FK_youtube_channel_sync_items_channel" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_youtube_channel_sync_items_run_result_review" ON "youtube_channel_sync_items" ("sync_run_id", "sync_result", "review_status")`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "youtube_channel_sync_items"`);
		await queryRunner.query(`DROP TABLE "youtube_channel_sync_runs"`);
	}
}
