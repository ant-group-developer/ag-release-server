import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportImportFlags1781081038000
	implements MigrationInterface
{
	name = 'AddReportImportFlags1781081038000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const tables = [
			'labels',
			'artists',
			'releases',
			'release_artist',
			'tracks',
			'track_artist',
		];

		for (const table of tables) {
			await queryRunner.query(
				`ALTER TABLE "${table}" ADD "is_imported_from_report" boolean NOT NULL DEFAULT false`,
			);
			await queryRunner.query(
				`COMMENT ON COLUMN "${table}"."is_imported_from_report" IS 'Created by the release report import flow'`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const tables = [
			'track_artist',
			'tracks',
			'release_artist',
			'releases',
			'artists',
			'labels',
		];

		for (const table of tables) {
			await queryRunner.query(
				`ALTER TABLE "${table}" DROP COLUMN "is_imported_from_report"`,
			);
		}
	}
}
