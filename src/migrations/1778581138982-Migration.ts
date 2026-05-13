import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778581138982 implements MigrationInterface {
    name = 'Migration1778581138982'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "uq_release_dsp_delivery_release_dsp" UNIQUE ("release_id", "dsp_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "uq_release_dsp_delivery_release_dsp"`);
    }

}
