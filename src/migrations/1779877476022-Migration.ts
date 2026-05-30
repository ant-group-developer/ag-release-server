import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1779877476022 implements MigrationInterface {
    name = 'Migration1779877476022';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
			ALTER TABLE "ci_distribution_jobs"
			ADD COLUMN "ci_tool_next_check_at" TIMESTAMPTZ NULL
		`);

        await queryRunner.query(`
			ALTER TABLE "ci_distribution_jobs"
			ADD COLUMN "ci_tool_job_id" character varying NULL
		`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
			ALTER TABLE "ci_distribution_jobs"
			DROP COLUMN "ci_tool_job_id"
		`);

        await queryRunner.query(`
			ALTER TABLE "ci_distribution_jobs"
			DROP COLUMN "ci_tool_next_check_at"
		`);
    }
}