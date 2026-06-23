import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReleaseFormatsIdCiToReleases1781269000000
	implements MigrationInterface
{
	name = 'AddReleaseFormatsIdCiToReleases1781269000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "releases" ADD "release_formats_id_ci" character varying(50)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."release_formats_id_ci" IS 'CI release format ID'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "releases" DROP COLUMN "release_formats_id_ci"`,
		);
	}
}
