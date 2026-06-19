import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnrichmentMetadataJson1781230045715
	implements MigrationInterface
{
	name = 'AddEnrichmentMetadataJson1781230045715';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "metadata_deezer" jsonb`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."metadata_deezer" IS 'Metadata deezer'`,
		);

		await queryRunner.query(
			`ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "metadata_spotify" jsonb`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."metadata_spotify" IS 'Metadata spotify'`,
		);

		await queryRunner.query(
			`ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "metadata_deezer" jsonb`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."metadata_deezer" IS 'Metadata deezer'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP COLUMN IF EXISTS "metadata_deezer"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP COLUMN IF EXISTS "metadata_spotify"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP COLUMN IF EXISTS "metadata_deezer"`,
		);
	}
}
