import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780240849484 implements MigrationInterface {
    name = 'Migration1780240849484'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD "ci_tool_next_check_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD "ci_tool_job_id" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP COLUMN "ci_tool_job_id"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP COLUMN "ci_tool_next_check_at"`);
    }

}
