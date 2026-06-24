import { MigrationInterface, QueryRunner } from "typeorm";

export class AddParentIdToNewsCategory1782281474763 implements MigrationInterface {
    name = 'AddParentIdToNewsCategory1782281474763'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Chỉ giữ lại câu lệnh thêm cột parent_id và comment/khoá ngoại của bảng news_categories
        await queryRunner.query(`ALTER TABLE "news_categories" ADD "parent_id" uuid`);
        await queryRunner.query(`COMMENT ON COLUMN "news_categories"."parent_id" IS 'Danh mục tin tức cha (nếu có)'`);
        await queryRunner.query(`ALTER TABLE "news_categories" ADD CONSTRAINT "FK_d95fa89a24aac2a9120b5409f10" FOREIGN KEY ("parent_id") REFERENCES "news_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news_categories" DROP CONSTRAINT "FK_d95fa89a24aac2a9120b5409f10"`);
        await queryRunner.query(`ALTER TABLE "news_categories" DROP COLUMN "parent_id"`);
    }
}
