import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddYoutubeChannelIdAndThumbToChannels1781087000000
	implements MigrationInterface
{
	name = 'AddYoutubeChannelIdAndThumbToChannels1781087000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "channels" ADD "youtube_channel_id" character varying(100)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."youtube_channel_id" IS 'YouTube channel ID returned by Vevo'`,
		);
		await queryRunner.query(
			`ALTER TABLE "channels" ADD "thumb_id" uuid`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."thumb_id" IS 'ID file thumbnail cua channel'`,
		);
		await queryRunner.query(`
			ALTER TABLE "channels"
			ADD CONSTRAINT "FK_channels_thumb_id_files"
			FOREIGN KEY ("thumb_id") REFERENCES "files"("id")
			ON DELETE SET NULL ON UPDATE NO ACTION
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "channels" DROP CONSTRAINT "FK_channels_thumb_id_files"`,
		);
		await queryRunner.query(`ALTER TABLE "channels" DROP COLUMN "thumb_id"`);
		await queryRunner.query(
			`ALTER TABLE "channels" DROP COLUMN "youtube_channel_id"`,
		);
	}
}
