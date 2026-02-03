import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1769674490083 implements MigrationInterface {
    name = 'Migration1769674490083'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "dsp_usage_count" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "aggregators"."dsp_usage_count" IS 'Số lần sử dụng DSP'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "aggregators"."dsp_usage_count" IS 'Số lần sử dụng DSP'`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "dsp_usage_count"`);
    }

}
