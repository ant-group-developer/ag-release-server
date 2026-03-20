import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773974795313 implements MigrationInterface {
    name = 'Migration1773974795313'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "artists" DROP COLUMN "spotify_id"`);
        await queryRunner.query(`ALTER TABLE "artists" DROP COLUMN "apple_music_id"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD "content" text`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."content" IS 'Nội dung chi tiết của lỗi hoặc thông tin log'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_territories"."selected_countries" IS 'Danh sách quốc gia được chọn: phân phối tại (ONLY_IN) hoặc loại trừ (EVERYWHERE_EXCEPT)'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "release_territories"."selected_countries" IS 'Danh sách quốc gia được chọn để phân phối'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."content" IS 'Nội dung chi tiết của lỗi hoặc thông tin log'`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP COLUMN "content"`);
        await queryRunner.query(`ALTER TABLE "artists" ADD "apple_music_id" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "artists" ADD "spotify_id" character varying(255)`);
    }

}
