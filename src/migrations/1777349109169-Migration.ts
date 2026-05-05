import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777349109169 implements MigrationInterface {
    name = 'Migration1777349109169'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD "issues" jsonb`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."issues" IS 'Danh sách issues (QA flags, validation errors, v.v.)'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."issues" IS 'Danh sách issues (QA flags, validation errors, v.v.)'`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP COLUMN "issues"`);
    }

}
