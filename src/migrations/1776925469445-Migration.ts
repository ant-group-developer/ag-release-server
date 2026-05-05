import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776925469445 implements MigrationInterface {
    name = 'Migration1776925469445'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP CONSTRAINT "FK_30b4b958ea9c6256d403784a3bc"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP COLUMN "dsp_ids"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP COLUMN "dsp_id"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP COLUMN "error_message"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD "dsp" jsonb`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD "dsps" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP COLUMN "dsps"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP COLUMN "dsp"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD "error_message" text`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD "dsp_id" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD "dsp_ids" jsonb`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD CONSTRAINT "FK_30b4b958ea9c6256d403784a3bc" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
