import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774085476326 implements MigrationInterface {
    name = 'Migration1774085476326'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_logs" DROP CONSTRAINT "FK_c410149643acdb848695efb420e"`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP COLUMN "releaseId"`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD "dsp_code" character varying`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD "dsp_id" character varying`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD "content" jsonb`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP COLUMN "release_id"`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD "release_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD CONSTRAINT "FK_917451c352a07f552b93a40b33e" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD CONSTRAINT "FK_ded1cdf4d990ae55d85e273514f" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_logs" DROP CONSTRAINT "FK_ded1cdf4d990ae55d85e273514f"`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP CONSTRAINT "FK_917451c352a07f552b93a40b33e"`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP COLUMN "release_id"`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD "release_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP COLUMN "content"`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP COLUMN "dsp_id"`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP COLUMN "dsp_code"`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD "releaseId" uuid`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD CONSTRAINT "FK_c410149643acdb848695efb420e" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
