import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776322202517 implements MigrationInterface {
    name = 'Migration1776322202517'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" ADD "release_end_date" date`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."release_end_date" IS 'Ngày kết thúc phát hành Nullable when status is draft'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "releases"."release_end_date" IS 'Ngày kết thúc phát hành Nullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "release_end_date"`);
    }

}
