import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateYoutubeSearchCache1782722273601 implements MigrationInterface {
	name = 'CreateYoutubeSearchCache1782722273601';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "youtube_search_cache" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"query_hash" character varying(64) NOT NULL,
				"query_text" text NOT NULL,
				"lookup_kind" character varying(20) NOT NULL,
				"youtube_video_id" character varying(20),
				"youtube_channel_id" character varying(100),
				"youtube_channel_title" character varying(255),
				"matched_channel_id" uuid,
				"match_status" character varying(20) NOT NULL,
				"raw_response" jsonb,
				"cached_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
				CONSTRAINT "PK_youtube_search_cache_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_youtube_search_cache_query_hash" UNIQUE ("query_hash"),
				CONSTRAINT "FK_youtube_search_cache_matched_channel_id" FOREIGN KEY ("matched_channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE NO ACTION
			)
		`);

		await queryRunner.query(
			`CREATE INDEX "IDX_youtube_search_cache_expires_at" ON "youtube_search_cache" ("expires_at")`,
		);

		await queryRunner.query(
			`COMMENT ON TABLE "youtube_search_cache" IS 'Cache ket qua goi YouTube API de tranh burn quota'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_search_cache"."query_hash" IS 'sha256 cua normalized query (kind:input)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_search_cache"."lookup_kind" IS 'by_id (goi videos.list) | search (goi search.list)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_search_cache"."match_status" IS 'matched | no_match | no_data'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_search_cache"."matched_channel_id" IS 'UUID cua channels Postgres neu tim thay match, NULL neu chua co'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "youtube_search_cache"."raw_response" IS 'Top 3 items tra ve tu YouTube search (json) de admin trace'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_youtube_search_cache_expires_at"`,
		);
		await queryRunner.query(`DROP TABLE "youtube_search_cache"`);
	}
}
