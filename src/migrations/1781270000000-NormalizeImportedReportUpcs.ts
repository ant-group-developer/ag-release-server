import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeImportedReportUpcs1781270000000
	implements MigrationInterface
{
	name = 'NormalizeImportedReportUpcs1781270000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "releases"
			SET "upc" = regexp_replace("upc", '^0+', '')
			WHERE "is_imported_from_report" = true
				AND "upc" ~ '^0+[0-9]+$'
				AND regexp_replace("upc", '^0+', '') <> ''
		`);

		await queryRunner.query(`
			UPDATE "tracks"
			SET "isrc" = 'UPC-' || regexp_replace(substring("isrc" from 5), '^0+', '')
			WHERE "is_imported_from_report" = true
				AND "isrc" ~ '^UPC-0+[0-9]+$'
				AND regexp_replace(substring("isrc" from 5), '^0+', '') <> ''
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			-- Irreversible data normalization: leading zero padding cannot be restored safely.
			SELECT 1
		`);
	}
}
