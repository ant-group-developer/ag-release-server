import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceChannelThumbIdWithThumbUrl1781268000000
	implements MigrationInterface
{
	name = 'ReplaceChannelThumbIdWithThumbUrl1781268000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "channels" DROP CONSTRAINT "FK_channels_thumb_id_files"`,
		);
		await queryRunner.query(`ALTER TABLE "channels" DROP COLUMN "thumb_id"`);
		await queryRunner.query(
			`ALTER TABLE "channels" ADD "thumb_url" character varying(500)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."thumb_url" IS 'Public thumbnail URL cua channel'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "channels" DROP COLUMN "thumb_url"`);
		await queryRunner.query(`ALTER TABLE "channels" ADD "thumb_id" uuid`);
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
}
