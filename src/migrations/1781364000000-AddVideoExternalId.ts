import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoExternalId1781364000000
	implements MigrationInterface
{
	name = 'AddVideoExternalId1781364000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "videos" ADD "external_id" character varying(100)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."external_id" IS 'External video id returned by Vevo video notification, used to build YouTube video URLNullable when status is draft'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "videos" DROP COLUMN "external_id"`,
		);
	}
}
