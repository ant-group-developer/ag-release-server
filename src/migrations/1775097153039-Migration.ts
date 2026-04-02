import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775097153039 implements MigrationInterface {
    name = 'Migration1775097153039'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "labels" DROP CONSTRAINT "UQ_543605929e5ebe08eeeab493f60"`);
        await queryRunner.query(`COMMENT ON COLUMN "labels"."code" IS 'Mã label duy nhất trong cùng tenant'`);
        await queryRunner.query(`ALTER TABLE "labels" DROP CONSTRAINT "UQ_430ce333ab69091340a9cf00707"`);
        await queryRunner.query(`ALTER TABLE "labels" ADD CONSTRAINT "UQ_e2d3e9ed9cc9af2785e3d3b3406" UNIQUE ("code", "tenant_id")`);
        await queryRunner.query(`ALTER TABLE "labels" ADD CONSTRAINT "UQ_f650ec773e0febceed73b196854" UNIQUE ("name", "tenant_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "labels" DROP CONSTRAINT "UQ_f650ec773e0febceed73b196854"`);
        await queryRunner.query(`ALTER TABLE "labels" DROP CONSTRAINT "UQ_e2d3e9ed9cc9af2785e3d3b3406"`);
        await queryRunner.query(`ALTER TABLE "labels" ADD CONSTRAINT "UQ_430ce333ab69091340a9cf00707" UNIQUE ("code")`);
        await queryRunner.query(`COMMENT ON COLUMN "labels"."code" IS 'Mã label duy nhất trong hệ thống'`);
        await queryRunner.query(`ALTER TABLE "labels" ADD CONSTRAINT "UQ_543605929e5ebe08eeeab493f60" UNIQUE ("name")`);
    }

}
