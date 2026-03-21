import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773979506552 implements MigrationInterface {
    name = 'Migration1773979506552'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" RENAME COLUMN "content" TO "logs"`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "logs" text`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."logs" IS 'Nội dung chi tiết của lỗi hoặc thông tin log'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "releases"."logs" IS 'Nội dung chi tiết của lỗi hoặc thông tin log'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "logs"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" RENAME COLUMN "logs" TO "content"`);
    }

}
