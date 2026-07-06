import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullIsImportedFromReportOnSchedules1783500000000
	implements MigrationInterface
{
	name = 'AllowNullIsImportedFromReportOnSchedules1783500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "metadata_scan_schedules"
			ALTER COLUMN "is_imported_from_report" DROP NOT NULL
		`);
		await queryRunner.query(`
			COMMENT ON COLUMN "metadata_scan_schedules"."is_imported_from_report"
			IS 'true: quét release import từ report, false: quét release không import từ report, null: quét cả 2'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "metadata_scan_schedules"
			SET "is_imported_from_report" = true
			WHERE "is_imported_from_report" IS NULL
		`);
		await queryRunner.query(`
			ALTER TABLE "metadata_scan_schedules"
			ALTER COLUMN "is_imported_from_report" SET NOT NULL
		`);
	}
}
