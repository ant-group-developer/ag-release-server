import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddYoutubeMatchToVideos1782722273602 implements MigrationInterface {
	name = 'AddYoutubeMatchToVideos1782722273602';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "videos" ADD COLUMN "youtube_match_status" character varying(20)`,
		);
		await queryRunner.query(
			`ALTER TABLE "videos" ADD COLUMN "youtube_match_scanned_at" TIMESTAMP WITH TIME ZONE`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."youtube_match_status" IS 'Trang thai map channel tu YouTube: matched | no_match | no_data (NULL = chua xu ly)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."youtube_match_scanned_at" IS 'Thoi diem enrich YouTube lan cuoi'`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_videos_youtube_match_status" ON "videos" ("youtube_match_status")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_videos_youtube_match_status"`,
		);
		await queryRunner.query(
			`ALTER TABLE "videos" DROP COLUMN "youtube_match_scanned_at"`,
		);
		await queryRunner.query(
			`ALTER TABLE "videos" DROP COLUMN "youtube_match_status"`,
		);
	}
}
