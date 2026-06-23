import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsInstrumentalToReleasesAndTracks1781082000000
	implements MigrationInterface
{
	name = 'AddIsInstrumentalToReleasesAndTracks1781082000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "releases" ADD "is_instrumental" boolean NOT NULL DEFAULT false`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."is_instrumental" IS 'Release instrumental'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD "is_instrumental" boolean NOT NULL DEFAULT false`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."is_instrumental" IS 'Track instrumental'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP COLUMN "is_instrumental"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP COLUMN "is_instrumental"`,
		);
	}
}
