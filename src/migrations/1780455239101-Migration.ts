import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780455239101 implements MigrationInterface {
    name = 'Migration1780455239101'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "videos" RENAME COLUMN "is_kids" TO "made_for_kids"`);
        await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "made_for_kids"`);
        await queryRunner.query(`ALTER TABLE "videos" ADD "made_for_kids" character varying(20) DEFAULT 'CHANNEL_DEFAULT'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."made_for_kids" IS 'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTube: YES, NO, CHANNEL_DEFAULTNullable when status is draft'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "videos"."made_for_kids" IS 'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTube: YES, NO, CHANNEL_DEFAULTNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "made_for_kids"`);
        await queryRunner.query(`ALTER TABLE "videos" ADD "made_for_kids" boolean DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "videos" RENAME COLUMN "made_for_kids" TO "is_kids"`);
    }

}
