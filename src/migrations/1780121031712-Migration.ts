import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780121031712 implements MigrationInterface {
    name = 'Migration1780121031712'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD "ci_tool_next_check_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD "ci_tool_job_id" character varying`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP COLUMN "ci_tool_job_id"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP COLUMN "ci_tool_next_check_at"`);
    }

}
