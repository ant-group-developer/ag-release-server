import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportImportProvenance1781363000000
	implements MigrationInterface
{
	name = 'AddReportImportProvenance1781363000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const tables = ['releases', 'tracks'];

		for (const table of tables) {
			await queryRunner.query(
				`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "import_source_type" character varying(50)`,
			);
			await queryRunner.query(
				`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "import_parser_code" character varying(100)`,
			);
			await queryRunner.query(
				`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "import_file_name" character varying(500)`,
			);
			await queryRunner.query(
				`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "import_job_id" character varying(100)`,
			);
		}

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_releases_report_import_created_at" ON "releases" ("is_imported_from_report", "created_at")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_releases_tenant_label" ON "releases" ("tenant_id", "label_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_releases_import_source_parser" ON "releases" ("import_source_type", "import_parser_code")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_releases_import_file_name" ON "releases" ("import_file_name")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_tracks_report_import_source" ON "tracks" ("release_id", "import_source_type", "import_file_name")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tracks_report_import_source"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_releases_import_file_name"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_releases_import_source_parser"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_releases_tenant_label"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_releases_report_import_created_at"`);

		const tables = ['tracks', 'releases'];
		for (const table of tables) {
			await queryRunner.query(
				`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "import_job_id"`,
			);
			await queryRunner.query(
				`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "import_file_name"`,
			);
			await queryRunner.query(
				`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "import_parser_code"`,
			);
			await queryRunner.query(
				`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "import_source_type"`,
			);
		}
	}
}
