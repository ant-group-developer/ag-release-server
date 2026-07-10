import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQaFlagsCiToReleaseCiData1783000000003
	implements MigrationInterface
{
	name = 'AddQaFlagsCiToReleaseCiData1783000000003';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			ADD COLUMN IF NOT EXISTS "qa_flags_ci" jsonb
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			DROP COLUMN IF EXISTS "qa_flags_ci"
		`);
	}
}
