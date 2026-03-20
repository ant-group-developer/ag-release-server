import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773988935156 implements MigrationInterface {
    name = 'Migration1773988935156'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dsps" ADD "code_ci" character varying(200)`);
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."code_ci" IS 'Mã DSP ci trong hệ thống'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."code_ci" IS 'Mã DSP ci trong hệ thống'`);
        await queryRunner.query(`ALTER TABLE "dsps" DROP COLUMN "code_ci"`);
    }

}
