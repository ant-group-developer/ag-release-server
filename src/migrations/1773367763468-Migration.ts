import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773367763468 implements MigrationInterface {
    name = 'Migration1773367763468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c7b8c5a2e7000180d5946d415f"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery_logs" DROP COLUMN "dsp_id"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery_logs" ADD "dsp_id" character varying NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery_logs"."dsp_id" IS 'ID của DSP nơi release được phân phối'`);
        await queryRunner.query(`CREATE INDEX "IDX_c7b8c5a2e7000180d5946d415f" ON "release_dsp_delivery_logs" ("dsp_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c7b8c5a2e7000180d5946d415f"`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery_logs"."dsp_id" IS 'ID của DSP nơi release được phân phối'`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery_logs" DROP COLUMN "dsp_id"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery_logs" ADD "dsp_id" uuid NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_c7b8c5a2e7000180d5946d415f" ON "release_dsp_delivery_logs" ("dsp_id") `);
    }

}
