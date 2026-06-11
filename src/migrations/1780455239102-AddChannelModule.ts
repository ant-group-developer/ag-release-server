import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelModule1780455239102 implements MigrationInterface {
	name = 'AddChannelModule1780455239102';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
            CREATE TABLE "channels" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(150) NOT NULL,
                CONSTRAINT "UQ_channels_name" UNIQUE ("name"),
                CONSTRAINT "PK_channels_id" PRIMARY KEY ("id")
            )
        `);
		await queryRunner.query(
			`COMMENT ON TABLE "channels" IS 'Danh muc channel dung cho video distribution'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."name" IS 'Ten channel'`,
		);
		await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "channel"`);
		await queryRunner.query(`ALTER TABLE "videos" ADD "channel_id" uuid`);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."channel_id" IS 'Channel chi dinh de dang tai video len YouTube/VevoNullable when status is draft'`,
		);
		await queryRunner.query(`
            ALTER TABLE "videos"
            ADD CONSTRAINT "FK_videos_channel_id_channels"
            FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_channel_id_channels"`,
		);
		await queryRunner.query(
			`ALTER TABLE "videos" ADD "channel" character varying(150)`,
		);
		await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "channel_id"`);
		await queryRunner.query(`DROP TABLE "channels"`);
	}
}
