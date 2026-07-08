import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNeedImportAgainToReleaseCiData1783000000004
	implements MigrationInterface
{
	name = 'AddNeedImportAgainToReleaseCiData1783000000004';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			ADD COLUMN IF NOT EXISTS "need_import_again" boolean NOT NULL DEFAULT false
		`);

		await queryRunner.query(`
			UPDATE "release_ci_data"
			SET "need_import_again" = true
			WHERE "status" = 'NOT_FOUND_ON_CI'
		`);

		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			ALTER COLUMN "need_import_again" SET DEFAULT true
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			DROP COLUMN IF EXISTS "need_import_again"
		`);
	}
}
