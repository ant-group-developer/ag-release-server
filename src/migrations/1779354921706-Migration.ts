import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779354921706 implements MigrationInterface {
    name = 'Migration1779354921706'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD "note" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP COLUMN "note"`);
    }

}
