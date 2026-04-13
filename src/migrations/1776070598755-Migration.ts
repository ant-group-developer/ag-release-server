import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776070598755 implements MigrationInterface {
    name = 'Migration1776070598755'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "backups" ADD "url_r2" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_r2" IS 'URL file backup trên Cloudflare R2'`);
        await queryRunner.query(`ALTER TABLE "backups" ADD "url_folder_r2" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_folder_r2" IS 'Thư mục lưu backup trên Cloudflare R2'`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "retry_count" SET DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "retry_count" SET DEFAULT '3'`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_folder_r2" IS 'Thư mục lưu backup trên Cloudflare R2'`);
        await queryRunner.query(`ALTER TABLE "backups" DROP COLUMN "url_folder_r2"`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_r2" IS 'URL file backup trên Cloudflare R2'`);
        await queryRunner.query(`ALTER TABLE "backups" DROP COLUMN "url_r2"`);
    }

}
