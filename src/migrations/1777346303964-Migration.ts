import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777346303964 implements MigrationInterface {
    name = 'Migration1777346303964'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP COLUMN "dsp"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP COLUMN "dsps"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD "dsps" jsonb`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD "dsp" jsonb`);
    }

}
