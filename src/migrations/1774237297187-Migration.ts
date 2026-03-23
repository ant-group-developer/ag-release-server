import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774237297187 implements MigrationInterface {
    name = 'Migration1774237297187'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD "is_selected" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP COLUMN "is_selected"`);
    }

}
