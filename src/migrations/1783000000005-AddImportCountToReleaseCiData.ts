import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImportCountToReleaseCiData1783000000005
	implements MigrationInterface
{
	name = 'AddImportCountToReleaseCiData1783000000005';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			ADD COLUMN IF NOT EXISTS "import_count" integer NOT NULL DEFAULT 0
		`);

		await queryRunner.query(`
			UPDATE "release_ci_data"
			SET "import_count" = CASE
				WHEN "import_raw_data" IS NULL THEN 0
				WHEN jsonb_typeof("import_raw_data") = 'array'
					THEN jsonb_array_length("import_raw_data")
				WHEN jsonb_typeof("import_raw_data" -> '_embedded') = 'array'
					THEN jsonb_array_length("import_raw_data" -> '_embedded')
				WHEN jsonb_typeof("import_raw_data" -> '_embedded' -> 'items') = 'array'
					THEN jsonb_array_length("import_raw_data" -> '_embedded' -> 'items')
				WHEN jsonb_typeof("import_raw_data" -> 'items') = 'array'
					THEN jsonb_array_length("import_raw_data" -> 'items')
				ELSE 1
			END
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			DROP COLUMN IF EXISTS "import_count"
		`);
	}
}
